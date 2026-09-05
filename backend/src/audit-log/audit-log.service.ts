import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  // Q33/Q34-style gap: AuditLog has been write-only since M5 -- this is the
  // first read path. actorId/organizationId are scalar FKs with no declared
  // Prisma relation (same shape as Invitation.roleId), so they're resolved
  // with separate batch lookups rather than an `include`.
  async list(query: ListAuditLogQueryDto) {
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count(),
    ]);

    const actorIds = [
      ...new Set(
        entries.map((e) => e.actorId).filter((id): id is string => id !== null),
      ),
    ];
    const organizationIds = [
      ...new Set(
        entries
          .map((e) => e.organizationId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const [actors, organizations] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, email: true },
      }),
      this.prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, name: true },
      }),
    ]);
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const organizationById = new Map(organizations.map((o) => [o.id, o]));

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        actor: entry.actorId ? (actorById.get(entry.actorId) ?? null) : null,
        organization: entry.organizationId
          ? (organizationById.get(entry.organizationId) ?? null)
          : null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
}
