import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { OrganizationStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const ORG_NOT_FOUND_MESSAGE = 'Organization not found.';

@Injectable()
export class OrganizationsService {
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
