import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

const INVALID_TOKEN_MESSAGE = 'Invalid or expired verification token.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  constructor(private readonly prisma: PrismaService) {}

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
    const passwordHash = await this.hashPassword(dto.password);

    let user;
    try {
      user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash, fullName: dto.fullName },
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

    const rawToken = this.generateOpaqueToken();
    const ttlHours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS ?? 24);
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashOpaqueToken(rawToken),
        purpose: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
    });

    // Stubbed per docs/open-questions.md Q12 -- no email provider chosen
    // yet, so the link is logged rather than emailed.
    this.logger.log(
      `Verification link for ${user.email}: /auth/verify-email?token=${rawToken}`,
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
    };
  }

  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: this.hashOpaqueToken(rawToken) },
    });

    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFICATION' ||
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

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    });

    return { verified: true };
  }
}
