import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApplicationStatus,
  JobStatus,
  OfferStatus,
  OrganizationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

// Interview.status is a plain string in the schema (not a Prisma enum --
// see schema.prisma's own comment), matching that existing choice here.
const INTERVIEW_STATUSES = [
  'SCHEDULED',
  'COMPLETED',
  'RESCHEDULED',
  'CANCELLED',
] as const;

// REQ-ANALYTICS-001/002/Q32: point-in-time funnel counts only -- no
// trends or derived rate/duration metrics, since no schema field
// unambiguously marks when a status transition happened.
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrgAnalytics(orgId: string | null) {
    const organizationId = this.requireOrgId(orgId);
    const [jobs, applications, interviews, offers] = await Promise.all([
      this.jobsByStatus({ organizationId }),
      this.applicationsByStatus({ organizationId }),
      this.interviewsByStatus({ organizationId }),
      this.offersByStatus({ organizationId }),
    ]);
    return { jobs, applications, interviews, offers };
  }

  // Platform-wide, not tenant-scoped -- Super Admin only
  // (analytics:platform), same "not org-scoped" reasoning
  // authorization.md §5 gives the rest of the /api/admin/* namespace.
  async getPlatformAnalytics() {
    const [organizations, jobs, applications, subscriptions] =
      await Promise.all([
        this.organizationsByStatus(),
        this.jobsByStatus({}),
        this.applicationsByStatus({}),
        this.subscriptionsByPlan(),
      ]);
    return { organizations, jobs, applications, subscriptions };
  }

  private async jobsByStatus(where: { organizationId?: string }) {
    const grouped = await this.prisma.job.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    return this.toCountsByKey(grouped, Object.values(JobStatus));
  }

  private async applicationsByStatus(where: { organizationId?: string }) {
    const grouped = await this.prisma.application.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    return this.toCountsByKey(grouped, Object.values(ApplicationStatus));
  }

  private async interviewsByStatus(where: { organizationId?: string }) {
    const grouped = await this.prisma.interview.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    return this.toCountsByKey(grouped, INTERVIEW_STATUSES);
  }

  private async offersByStatus(where: { organizationId?: string }) {
    const grouped = await this.prisma.offer.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    return this.toCountsByKey(grouped, Object.values(OfferStatus));
  }

  private async organizationsByStatus() {
    const grouped = await this.prisma.organization.groupBy({
      by: ['status'],
      _count: true,
    });
    return this.toCountsByKey(grouped, Object.values(OrganizationStatus));
  }

  // Subscription.planId can't be grouped directly into a friendly label
  // via Prisma's groupBy (it doesn't traverse relations) -- resolved with
  // a small separate Plan lookup instead, same "explicit second query"
  // pattern TalentPoolsService.loadCandidates() already established for a
  // similar limitation.
  private async subscriptionsByPlan() {
    const [grouped, plans] = await Promise.all([
      this.prisma.subscription.groupBy({ by: ['planId'], _count: true }),
      this.prisma.plan.findMany({ select: { id: true, key: true } }),
    ]);
    const planKeyById = new Map(plans.map((plan) => [plan.id, plan.key]));
    const byPlan = Object.fromEntries(plans.map((plan) => [plan.key, 0]));
    let total = 0;
    for (const row of grouped) {
      const key = planKeyById.get(row.planId);
      if (key) {
        byPlan[key] = row._count;
      }
      total += row._count;
    }
    return { total, byPlan };
  }

  private toCountsByKey<TStatus extends string>(
    grouped: { status: TStatus; _count: number }[],
    allStatuses: readonly TStatus[],
  ) {
    const byStatus = Object.fromEntries(
      allStatuses.map((status) => [status, 0]),
    ) as Record<TStatus, number>;
    let total = 0;
    for (const row of grouped) {
      byStatus[row.status] = row._count;
      total += row._count;
    }
    return { total, byStatus };
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }
}
