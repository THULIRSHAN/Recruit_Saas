import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SwitchOrgDto } from './dto/switch-org.dto';

const INVALID_TOKEN_MESSAGE = 'Invalid or expired verification token.';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid or expired refresh token.';
// 404, not 403, per docs/multi-tenancy.md §5 -- don't confirm an org ID
// exists to a caller who isn't a member of it.
const ORG_NOT_FOUND_MESSAGE = 'Organization not found.';

export interface AccessTokenPayload {
  sub: string;
  // null/[] for a pure candidate (no org memberships) or a user belonging
  // to 2+ orgs (ambiguous -- call /auth/switch-org to pick one). Populated
  // only when membership is unambiguous -- see resolveDefaultOrgContext.
  orgId: string | null;
  roles: string[];
  isSuperAdmin: boolean;
  // Display-only -- there's no separate "get my user profile" endpoint, and
  // the frontend needs a name/email to render (e.g. the sidebar user block)
  // without a second round trip. Never used for authorization decisions.
  email: string;
  fullName: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  // Opaque tokens (refresh tokens, email-verification/password-reset
  // tokens) are high-entropy random values looked up by exact match, not
  // user-chosen secrets -- bcrypt's slow, salted (non-deterministic) hash
  // is the wrong tool here (it can't be queried with a plain WHERE clause).
  // A fast deterministic hash is fine, since brute-forcing a 256-bit
  // random value is infeasible regardless of hash speed.
  generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(dto: RegisterDto) {
    const { user } = await this.createUserAccount(dto);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
    };
  }

  // Shared with OrganizationsService's registration flow (REQ-AUTH-002),
  // which needs this to run inside the SAME transaction as creating the
  // Organization + owner UserOrganizationRole ("in one transaction" is an
  // explicit business rule, not just a nice-to-have) -- accepts an optional
  // transaction client instead of always using `this.prisma` directly.
  // Centralizes password hashing + duplicate-email handling + verification-
  // token issuance in one place rather than duplicating it per caller.
  //
  // `emailPreVerified` is for OrganizationsService's invitation-accept flow
  // (REQ-AUTH-008): possessing the invitation token already proves the
  // invitee controls that inbox, the same guarantee a separate
  // email-verification round trip would provide -- so skip issuing one.
  async createUserAccount(
    dto: { email: string; password: string; fullName: string },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    options?: { emailPreVerified?: boolean },
  ) {
    const passwordHash = await this.hashPassword(dto.password);

    let user;
    try {
      user = await client.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          emailVerified: options?.emailPreVerified ?? false,
        },
      });
    } catch (error) {
      // P2002 = unique constraint violation (email). Generic message on
      // purpose -- do not confirm which field failed (user enumeration).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Message matches docs/requirements.md REQ-AUTH-001's exact
        // suggested wording -- no field name, to avoid confirming which
        // field failed (user enumeration).
        throw new ConflictException('An account may already exist.');
      }
      throw error;
    }

    if (options?.emailPreVerified) {
      return { user, rawVerificationToken: null };
    }

    const rawVerificationToken = this.generateOpaqueToken();
    const ttlHours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS ?? 24);
    await client.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashOpaqueToken(rawVerificationToken),
        purpose: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
    });

    // Stubbed per docs/open-questions.md Q12 -- no email provider chosen
    // yet, so the link is logged rather than emailed.
    this.logger.log(
      `Verification link for ${user.email}: /api/v1/auth/verify-email?token=${rawVerificationToken}`,
    );

    return { user, rawVerificationToken };
  }

  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const record = await this.claimToken(rawToken, 'EMAIL_VERIFICATION');

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    });

    return { verified: true };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Always "succeed" from the caller's perspective (controller returns
    // 200 either way) -- confirming an email doesn't exist is the
    // enumeration leak this flow specifically exists to avoid.
    if (!user) {
      return;
    }

    const rawToken = this.generateOpaqueToken();
    const ttlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashOpaqueToken(rawToken),
        purpose: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    });

    // Stubbed per docs/open-questions.md Q12 -- no email provider chosen
    // yet, so the link is logged rather than emailed.
    this.logger.log(
      `Password reset link for ${user.email}: /api/v1/auth/reset-password?token=${rawToken}`,
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.claimToken(dto.token, 'PASSWORD_RESET');
    const passwordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    // The old password may have been compromised (that's why a reset was
    // requested) -- force re-login everywhere, per docs/authentication.md §3.
    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Shared by verifyEmail and resetPassword: both are "find an unused,
  // unexpired, purpose-matched token by hash, then atomically claim it."
  private async claimToken(
    rawToken: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: this.hashOpaqueToken(rawToken) },
    });

    if (
      !record ||
      record.purpose !== purpose ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE);
    }

    // Guard the claim on usedAt: null so a concurrent request replaying the
    // same token can't also succeed (updateMany returns 0 rows if another
    // request already claimed it first).
    const claim = await this.prisma.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE);
    }

    return record;
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Same generic message whether the email doesn't exist or the password
    // is wrong -- confirming which one it was is a user-enumeration leak.
    if (
      !user ||
      !(await this.comparePassword(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.issueTokenPair(user);
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const user = await this.claimRefreshToken(rawToken);
    return this.issueTokenPair(user);
  }

  // Per docs/authentication.md §5: re-issues a token scoped to a different
  // org the caller is a member of, without a full re-login. Authenticated
  // by the refresh cookie (same trust model as refresh() itself, and
  // available even if the access token has since expired) rather than
  // requiring a fresh access token -- see the @Public() note on the
  // controller method.
  async switchOrg(
    rawRefreshToken: string,
    dto: SwitchOrgDto,
  ): Promise<TokenPair> {
    const user = await this.claimRefreshToken(rawRefreshToken);

    const memberships = await this.prisma.userOrganizationRole.findMany({
      where: { userId: user.id, organizationId: dto.organizationId },
      include: { role: true },
    });
    if (memberships.length === 0) {
      throw new NotFoundException(ORG_NOT_FOUND_MESSAGE);
    }

    const roles = memberships.map((m) => m.role.key);
    return this.issueTokenPair(user, { orgId: dto.organizationId, roles });
  }

  // Shared by refresh() and switchOrg(): validate the presented refresh
  // token and atomically rotate it (revoke), returning its owner. Guarding
  // the revoke on revokedAt: null so a concurrent replay of the same token
  // can't rotate twice -- the second request's updateMany affects 0 rows
  // and is rejected. This is also what makes a stolen-and-reused token
  // detectable (docs/authentication.md §2): once either party rotates it,
  // the other's next attempt fails.
  private async claimRefreshToken(rawToken: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashOpaqueToken(rawToken) },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    return record.user;
  }

  // Idempotent: a missing or already-invalid token still "succeeds" (no
  // error, no info leak) -- the end state (no valid session for that
  // token) is the same either way, and logout shouldn't fail just because
  // the user already logged out in another tab.
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashOpaqueToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    user: {
      id: string;
      isSuperAdmin: boolean;
      email: string;
      fullName: string;
    },
    orgContext?: { orgId: string; roles: string[] },
  ): Promise<TokenPair> {
    const { orgId, roles } =
      orgContext ?? (await this.resolveDefaultOrgContext(user.id));

    const payload: AccessTokenPayload = {
      sub: user.id,
      orgId,
      roles,
      isSuperAdmin: user.isSuperAdmin,
      email: user.email,
      fullName: user.fullName,
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = this.generateOpaqueToken();
    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashOpaqueToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  // Per docs/authentication.md §5: auto-select only when unambiguous (a
  // pure candidate with zero memberships, or a user belonging to exactly
  // one org). Two or more memberships get no default context -- the
  // frontend must call /auth/switch-org (M4.3) to pick one explicitly,
  // rather than this silently guessing which org the user meant.
  private async resolveDefaultOrgContext(
    userId: string,
  ): Promise<{ orgId: string | null; roles: string[] }> {
    const memberships = await this.prisma.userOrganizationRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
    if (orgIds.length !== 1) {
      return { orgId: null, roles: [] };
    }

    const [orgId] = orgIds;
    const roles = memberships
      .filter((m) => m.organizationId === orgId)
      .map((m) => m.role.key);
    return { orgId, roles };
  }
}
