import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

function createPrismaMock() {
  const job = { groupBy: jest.fn() };
  const application = { groupBy: jest.fn() };
  const interview = { groupBy: jest.fn() };
  const offer = { groupBy: jest.fn() };
  const organization = { groupBy: jest.fn() };
  const subscription = { groupBy: jest.fn() };
  const plan = { findMany: jest.fn() };
  const prisma = {
    job,
    application,
    interview,
    offer,
    organization,
    subscription,
    plan,
  };
  return {
    prisma: prisma as unknown as PrismaService,
    job,
    application,
    interview,
    offer,
    organization,
    subscription,
    plan,
  };
}

describe('AnalyticsService', () => {
  describe('getOrgAnalytics', () => {
    it('returns funnel counts scoped to the org, with all statuses present', async () => {
      const { prisma, job, application, interview, offer } = createPrismaMock();
      job.groupBy.mockResolvedValue([{ status: 'PUBLISHED', _count: 2 }]);
      application.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: 3 },
        { status: 'HIRED', _count: 1 },
      ]);
      interview.groupBy.mockResolvedValue([{ status: 'SCHEDULED', _count: 1 }]);
      offer.groupBy.mockResolvedValue([]);
      const service = new AnalyticsService(prisma);

      const result = await service.getOrgAnalytics('org-1');

      expect(job.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.jobs).toEqual({
        total: 2,
        byStatus: { DRAFT: 0, PUBLISHED: 2, CLOSED: 0, ARCHIVED: 0 },
      });
      expect(result.applications).toEqual({
        total: 4,
        byStatus: { ACTIVE: 3, WITHDRAWN: 0, REJECTED: 0, HIRED: 1 },
      });
      expect(result.interviews).toEqual({
        total: 1,
        byStatus: {
          SCHEDULED: 1,
          COMPLETED: 0,
          RESCHEDULED: 0,
          CANCELLED: 0,
        },
      });
      expect(result.offers).toEqual({
        total: 0,
        byStatus: { SENT: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0 },
      });
    });

    it('throws NotFoundException when there is no organization in session context', async () => {
      const { prisma } = createPrismaMock();
      const service = new AnalyticsService(prisma);

      await expect(service.getOrgAnalytics(null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getPlatformAnalytics', () => {
    it('returns platform-wide counts, not scoped to any organizationId', async () => {
      const { prisma, job, application, organization, subscription, plan } =
        createPrismaMock();
      organization.groupBy.mockResolvedValue([{ status: 'ACTIVE', _count: 5 }]);
      job.groupBy.mockResolvedValue([{ status: 'PUBLISHED', _count: 10 }]);
      application.groupBy.mockResolvedValue([{ status: 'ACTIVE', _count: 20 }]);
      plan.findMany.mockResolvedValue([
        { id: 'plan-free', key: 'FREE' },
        { id: 'plan-starter', key: 'STARTER' },
      ]);
      subscription.groupBy.mockResolvedValue([
        { planId: 'plan-free', _count: 3 },
      ]);
      const service = new AnalyticsService(prisma);

      const result = await service.getPlatformAnalytics();

      expect(job.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result.organizations.byStatus.ACTIVE).toBe(5);
      expect(result.jobs.total).toBe(10);
      expect(result.applications.total).toBe(20);
      expect(result.subscriptions).toEqual({
        total: 3,
        byPlan: { FREE: 3, STARTER: 0 },
      });
    });
  });
});
