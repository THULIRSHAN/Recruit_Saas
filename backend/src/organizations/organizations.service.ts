import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { OrganizationStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const ORG_NOT_FOUND_MESSAGE = 'Organization not found.';
const INVALID_INVITATION_MESSAGE = 'Invalid or expired invitation.';

// docs/open-questions.md Q11: CANDIDATE is implicit, never assigned via
// UserOrganizationRole -- it can't be invited into. SUPER_ADMIN is
// platform-scoped (User.isSuperAdmin), not org-scoped -- also not
// invitable through an org-scoped flow.
const NON_INVITABLE_ROLE_KEYS = new Set(['CANDIDATE', 'SUPER_ADMIN']);

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // REQ-AUTH-002: creates the Organization (PENDING_APPROVAL by default),
  // the owner User, and the COMPANY_OWNER UserOrganizationRole row all in
  // one transaction -- an explicit business rule, not just tidiness (a
  // partial failure must never leave an Organization with no owner, or a
  // User account with no role, dangling).
  async registerOrganization(dto: RegisterOrganizationDto) {
    return this.prisma.$transaction(async (tx) => {
      const { user } = await this.authService.createUserAccount(
        {
          email: dto.ownerEmail,
          password: dto.ownerPassword,
          fullName: dto.ownerFullName,
        },
        tx,
      );

      const organization = await tx.organization.create({
        data: { name: dto.organizationName },
      });

      const ownerRole = await tx.role.findUniqueOrThrow({
        where: { key: 'COMPANY_OWNER' },
      });
      await tx.userOrganizationRole.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: ownerRole.id,
        },
      });

      return {
        organization: {
          id: organization.id,
          name: organization.name,
          status: organization.status,
        },
        owner: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    });
  }

  // REQ-AUTH-003: only a PENDING_APPROVAL org can be approved; written to
  // AuditLog as a business rule, not an incidental nice-to-have.
  async approve(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requirePendingOrganization(tx, id);

      const updated = await tx.organization.update({
        where: { id },
        data: { status: OrganizationStatus.ACTIVE, approvedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId: id,
          action: 'organization.approved',
          targetType: 'Organization',
          targetId: id,
        },
      });

      return this.toSummary(updated);
    });
  }

  // REQ-AUTH-003 alt flow: rejection always carries a reason and, per the
  // seeded User.email unique constraint, permanently blocks re-registration
  // with the same owner email unless a Super Admin intervenes on the User
  // row directly -- satisfying "cannot re-register... without Super Admin
  // intervention" without any extra mechanism.
  async reject(id: string, actorId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requirePendingOrganization(tx, id);

      const updated = await tx.organization.update({
        where: { id },
        data: { status: OrganizationStatus.REJECTED, rejectedReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          organizationId: id,
          action: 'organization.rejected',
          targetType: 'Organization',
          targetId: id,
          metadata: { reason },
        },
      });

      return this.toSummary(updated);
    });
  }

  // Super Admin's review queue (REQ-AUTH-003). Platform-level, not
  // tenant-scoped -- see docs/authorization.md §5.
  async list(query: ListOrganizationsQueryDto) {
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          approvedAt: true,
          rejectedReason: true,
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // docs/open-questions.md Q15: any org-scoped role can view its own org
  // (not gated by organization:update) -- every staff member needs to see
  // the "pending approval" screen while status is PENDING_APPROVAL, not
  // just the Company Owner. `orgId` comes only from the caller's own access
  // token, never a client-supplied id, so there is no cross-tenant surface
  // to guard against here at all.
  async getMine(orgId: string | null) {
    return this.toDetail(await this.requireOwnOrganization(orgId));
  }

  // Gated by organization:update at the controller (Company Owner only).
  // Q15: writes require status === ACTIVE, mirroring REQ-AUTH-002's "not
  // usable... until Super Admin approves."
  // No frontend-facing way to pick an interview panel existed anywhere in
  // the API -- REQ-INT-001/002 assumes a Recruiter can see the org's
  // interviewers, but nothing enumerated org staff. Same no-permission-
  // gate reasoning as getMine(): any org-scoped role may see its own
  // teammates' names/emails/roles, and orgId comes only from the caller's
  // token, so there's no cross-tenant surface to guard.
  async listMembers(orgId: string | null) {
    const organization = await this.requireOwnOrganization(orgId);
    const memberships = await this.prisma.userOrganizationRole.findMany({
      where: { organizationId: organization.id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        role: { select: { key: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byUserId = new Map<
      string,
      { id: string; fullName: string; email: string; roles: string[] }
    >();
    for (const membership of memberships) {
      const existing = byUserId.get(membership.user.id);
      if (existing) {
        existing.roles.push(membership.role.key);
      } else {
        byUserId.set(membership.user.id, {
          id: membership.user.id,
          fullName: membership.user.fullName,
          email: membership.user.email,
          roles: [membership.role.key],
        });
      }
    }
    return Array.from(byUserId.values());
  }

  async updateMine(orgId: string | null, dto: UpdateOrganizationDto) {
    const organization = await this.requireOwnOrganization(orgId);
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ConflictException('Organization is not yet active.');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organization.id },
      data: { name: dto.name },
    });
    return this.toDetail(updated);
  }

  // REQ-AUTH-008: "Cannot invite into an org that is not ACTIVE"; token is a
  // single-use opaque value, stored hashed (docs/open-questions.md Q16),
  // 7-day expiry. Gated by user:invite at the controller.
  async inviteStaff(orgId: string | null, dto: CreateInvitationDto) {
    const organization = await this.requireOwnOrganization(orgId);
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ConflictException('Organization is not yet active.');
    }

    const role = await this.prisma.role.findUnique({
      where: { key: dto.roleKey },
    });
    if (!role || role.isPlatformRole || NON_INVITABLE_ROLE_KEYS.has(role.key)) {
      throw new BadRequestException(
        `Unknown or non-invitable role: ${dto.roleKey}`,
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      const alreadyHasRole = await this.prisma.userOrganizationRole.findUnique({
        where: {
          userId_organizationId_roleId: {
            userId: existingUser.id,
            organizationId: organization.id,
            roleId: role.id,
          },
        },
      });
      if (alreadyHasRole) {
        throw new ConflictException(
          'This person already holds that role at your organization.',
        );
      }
    }

    const pendingInvitation = await this.prisma.invitation.findFirst({
      where: {
        organizationId: organization.id,
        email: dto.email,
        roleId: role.id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingInvitation) {
      throw new ConflictException(
        'An invitation for this email and role is already pending.',
      );
    }

    const rawToken = this.authService.generateOpaqueToken();
    const ttlDays = Number(process.env.INVITATION_TTL_DAYS ?? 7);
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: organization.id,
        email: dto.email,
        roleId: role.id,
        tokenHash: this.authService.hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    // Stubbed per docs/open-questions.md Q12 -- logged, not emailed, until
    // the team picks an email provider. Points at the frontend page
    // (frontend/app/(auth)/accept-invitation/[token]), not the raw
    // POST-only API path.
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    this.logger.log(
      `Invitation link for ${dto.email} to join "${organization.name}" as ${role.name}: ${frontendUrl}/accept-invitation/${rawToken}`,
    );

    return {
      id: invitation.id,
      email: invitation.email,
      role: { key: role.key, name: role.name },
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  // Q34: only what's still actionable -- an accepted invitation is just a
  // member now (see listMembers()), and an expired one is already inert.
  async listPendingInvitations(orgId: string | null) {
    const organization = await this.requireOwnOrganization(orgId);
    const invitations = await this.prisma.invitation.findMany({
      where: {
        organizationId: organization.id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Invitation.roleId has no declared Prisma relation (scalar FK only) --
    // same reason inviteStaff() above resolves it with a separate lookup.
    const roles = await this.prisma.role.findMany({
      where: { id: { in: invitations.map((i) => i.roleId) } },
      select: { id: true, key: true, name: true },
    });
    const roleById = new Map(roles.map((r) => [r.id, r]));
    return invitations.map((invitation) => {
      const role = roleById.get(invitation.roleId);
      return {
        id: invitation.id,
        email: invitation.email,
        role: role ? { key: role.key, name: role.name } : null,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };
    });
  }

  // Q34: deleting rather than flagging "cancelled" -- nothing else in the
  // system ever needs to distinguish a cancelled invitation from one that
  // never existed (unlike Offer/Application, there's no history view over
  // invitations to preserve).
  async cancelInvitation(orgId: string | null, invitationId: string) {
    const organization = await this.requireOwnOrganization(orgId);
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId: organization.id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation) {
      throw new NotFoundException('Pending invitation not found.');
    }
    await this.prisma.invitation.delete({ where: { id: invitation.id } });
  }

  // Q34: removes this user's access to this org only -- their account and
  // any other org membership or candidate identity (Q3) are untouched.
  async removeMember(
    orgId: string | null,
    actorId: string,
    targetUserId: string,
  ) {
    const organization = await this.requireOwnOrganization(orgId);
    if (targetUserId === actorId) {
      throw new ConflictException(
        'You cannot remove yourself from the organization.',
      );
    }

    const memberships = await this.prisma.userOrganizationRole.findMany({
      where: { organizationId: organization.id, userId: targetUserId },
      include: { role: { select: { key: true } } },
    });
    if (memberships.length === 0) {
      throw new NotFoundException('Member not found.');
    }

    if (memberships.some((m) => m.role.key === 'COMPANY_OWNER')) {
      const ownerCount = await this.prisma.userOrganizationRole.count({
        where: {
          organizationId: organization.id,
          role: { key: 'COMPANY_OWNER' },
        },
      });
      if (ownerCount <= 1) {
        throw new ConflictException(
          "Cannot remove the organization's only Company Owner.",
        );
      }
    }

    await this.prisma.userOrganizationRole.deleteMany({
      where: { organizationId: organization.id, userId: targetUserId },
    });
  }

  // REQ-AUTH-008: "if new user, sets password and account is created
  // pre-bound to the org+role; if existing user, the role is attached to
  // their account for that org." Public -- possessing the token is the
  // proof of identity, same trust model as password reset (docs/
  // authentication.md §3: "validate token, update passwordHash", no
  // separate re-auth step).
  async acceptInvitation(rawToken: string, dto: AcceptInvitationDto) {
    const tokenHash = this.authService.hashOpaqueToken(rawToken);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt < new Date()
    ) {
      throw new BadRequestException(INVALID_INVITATION_MESSAGE);
    }

    return this.prisma.$transaction(async (tx) => {
      // Guard the claim on acceptedAt: null so a concurrent replay of the
      // same token can't also succeed -- same pattern as
      // AuthService.claimToken/claimRefreshToken.
      const claim = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException(INVALID_INVITATION_MESSAGE);
      }

      const role = await tx.role.findUniqueOrThrow({
        where: { id: invitation.roleId },
      });

      let user = await tx.user.findUnique({
        where: { email: invitation.email },
      });
      if (!user) {
        if (!dto.fullName || !dto.password) {
          throw new BadRequestException(
            'fullName and password are required to accept this invitation.',
          );
        }
        const created = await this.authService.createUserAccount(
          {
            email: invitation.email,
            password: dto.password,
            fullName: dto.fullName,
          },
          tx,
          { emailPreVerified: true },
        );
        user = created.user;
      }

      // Idempotent against an unlikely double-grant (e.g. two separate
      // invitations for the same email+role, both accepted).
      const alreadyMember = await tx.userOrganizationRole.findUnique({
        where: {
          userId_organizationId_roleId: {
            userId: user.id,
            organizationId: invitation.organizationId,
            roleId: invitation.roleId,
          },
        },
      });
      if (!alreadyMember) {
        await tx.userOrganizationRole.create({
          data: {
            userId: user.id,
            organizationId: invitation.organizationId,
            roleId: invitation.roleId,
          },
        });
      }

      return {
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: { key: role.key, name: role.name },
      };
    });
  }

  private async requireOwnOrganization(orgId: string | null) {
    if (!orgId) {
      throw new NotFoundException(ORG_NOT_FOUND_MESSAGE);
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!organization) {
      throw new NotFoundException(ORG_NOT_FOUND_MESSAGE);
    }
    return organization;
  }

  private async requirePendingOrganization(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const organization = await tx.organization.findUnique({ where: { id } });
    if (!organization) {
      throw new NotFoundException(ORG_NOT_FOUND_MESSAGE);
    }
    if (organization.status !== OrganizationStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Organization is already ${organization.status.toLowerCase()}.`,
      );
    }
    return organization;
  }

  private toSummary(organization: {
    id: string;
    name: string;
    status: OrganizationStatus;
  }) {
    return {
      id: organization.id,
      name: organization.name,
      status: organization.status,
    };
  }

  private toDetail(organization: {
    id: string;
    name: string;
    status: OrganizationStatus;
    createdAt: Date;
    approvedAt: Date | null;
    rejectedReason: string | null;
  }) {
    return {
      id: organization.id,
      name: organization.name,
      status: organization.status,
      createdAt: organization.createdAt,
      approvedAt: organization.approvedAt,
      rejectedReason: organization.rejectedReason,
    };
  }
}
