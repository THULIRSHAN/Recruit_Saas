import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

function createPrismaMock() {
  const plan = { findMany: jest.fn(), findUniqueOrThrow: jest.fn() };
  const subscription = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const payment = { create: jest.fn() };
  const prisma = { plan, subscription, payment };
  return {
    prisma: prisma as unknown as PrismaService,
    plan,
    subscription,
    payment,
  };
}

const basePlan = {
  id: 'plan-free',
  key: 'FREE',
  name: 'Free',
  maxActiveJobs: 3,
  maxSeats: 5,
  priceCents: 0,
};

const basePaidPlan = {
  id: 'plan-starter',
  key: 'STARTER',
  name: 'Starter',
  maxActiveJobs: 20,
  maxSeats: 20,
  priceCents: 4900,
};

const baseSubscription = {
  id: 'sub-1',
  organizationId: 'org-1',
  planId: 'plan-free',
  status: 'ACTIVE',
  currentPeriodEnd: null,
  plan: basePlan,
  payments: [],
};

describe('SubscriptionsService', () => {
  describe('listPlans', () => {
    it('returns the seeded plan catalog', async () => {
      const { prisma, plan } = createPrismaMock();
      plan.findMany.mockResolvedValue([basePlan, basePaidPlan]);
      const service = new SubscriptionsService(prisma);

      const result = await service.listPlans();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('FREE');
    });
  });

  describe('getMine', () => {
    it("returns the org's current subscription", async () => {
      const { prisma, subscription } = createPrismaMock();
      subscription.findUnique.mockResolvedValue(baseSubscription);
      const service = new SubscriptionsService(prisma);

      const result = await service.getMine('org-1');

      expect(subscription.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.plan?.key).toBe('FREE');
    });

    it('returns an empty-shaped subscription when no plan has been selected yet', async () => {
      const { prisma, subscription } = createPrismaMock();
      subscription.findUnique.mockResolvedValue(null);
      const service = new SubscriptionsService(prisma);

      const result = await service.getMine('org-1');

      expect(result).toEqual({
        id: null,
        status: null,
        currentPeriodEnd: null,
        plan: null,
        payments: [],
      });
    });

    it('throws NotFoundException when there is no organization in session context', async () => {
      const { prisma } = createPrismaMock();
      const service = new SubscriptionsService(prisma);

      await expect(service.getMine(null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('selectPlan', () => {
    it('selects the FREE plan without recording a payment', async () => {
      const { prisma, plan, subscription, payment } = createPrismaMock();
      plan.findUniqueOrThrow.mockResolvedValue(basePlan);
      subscription.upsert.mockResolvedValue({ id: 'sub-1' });
      subscription.findUniqueOrThrow.mockResolvedValue(baseSubscription);
      const service = new SubscriptionsService(prisma);

      const result = await service.selectPlan('org-1', { planKey: 'FREE' });

      expect(subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          create: expect.objectContaining({
            organizationId: 'org-1',
            planId: 'plan-free',
          }) as unknown,
        }),
      );
      expect(payment.create).not.toHaveBeenCalled();
      expect(result.plan?.key).toBe('FREE');
    });

    it('selects a paid plan and records a stub payment', async () => {
      const { prisma, plan, subscription, payment } = createPrismaMock();
      plan.findUniqueOrThrow.mockResolvedValue(basePaidPlan);
      subscription.upsert.mockResolvedValue({ id: 'sub-1' });
      subscription.findUniqueOrThrow.mockResolvedValue({
        ...baseSubscription,
        plan: basePaidPlan,
        payments: [
          {
            id: 'pay-1',
            amountCents: 4900,
            status: 'SUCCEEDED',
            createdAt: new Date(),
          },
        ],
      });
      const service = new SubscriptionsService(prisma);

      const result = await service.selectPlan('org-1', {
        planKey: 'STARTER',
      });

      expect(payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionId: 'sub-1',
            amountCents: 4900,
            status: 'SUCCEEDED',
          }) as unknown,
        }),
      );
      expect(result.payments).toHaveLength(1);
    });

    it('throws NotFoundException when there is no organization in session context', async () => {
      const { prisma } = createPrismaMock();
      const service = new SubscriptionsService(prisma);

      await expect(
        service.selectPlan(null, { planKey: 'FREE' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
