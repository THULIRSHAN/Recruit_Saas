import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SelectPlanDto } from './dto/select-plan.dto';

const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

const subscriptionInclude = {
  plan: true,
  payments: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SubscriptionInclude;

type SubscriptionWithRelations = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionInclude;
}>;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { priceCents: 'asc' },
    });
    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      maxActiveJobs: plan.maxActiveJobs,
      maxSeats: plan.maxSeats,
      priceCents: plan.priceCents,
    }));
  }

  async getMine(orgId: string | null) {
    const organizationId = this.requireOrgId(orgId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: subscriptionInclude,
    });
    // No plan chosen yet is a valid state (REQ-SUB-001's action -- selecting
    // a plan -- hasn't happened), not a 404 -- same reasoning as
    // CandidatesService.getMine() returning an empty-shaped profile. A
    // bare `null` return is deliberately avoided: NestJS's Express adapter
    // sends that as an empty body via response.send() rather than
    // response.json(null), which most JSON clients (including supertest)
    // then parse back as `{}`, not `null`.
    return this.toDetail(subscription);
  }

  // REQ-SUB-001/Q29: one Subscription per org (@@unique), switching plans
  // upserts it in place rather than creating a new row -- Payment history
  // is preserved per-transaction regardless of the current plan. The
  // actual Stripe Checkout call is stubbed (Q29, same resolution shape as
  // Q12/Q20): a non-zero-price plan is treated as an immediately-succeeded
  // payment, logged rather than actually charged, until a real Stripe test
  // account is provisioned.
  async selectPlan(orgId: string | null, dto: SelectPlanDto) {
    const organizationId = this.requireOrgId(orgId);
    const plan = await this.prisma.plan.findUniqueOrThrow({
      where: { key: dto.planKey },
    });

    const subscription = await this.prisma.subscription.upsert({
      where: { organizationId },
      update: { planId: plan.id, status: 'ACTIVE' },
      create: { organizationId, planId: plan.id, status: 'ACTIVE' },
    });

    if (plan.priceCents > 0) {
      const stripeEventId = `stub_${randomBytes(12).toString('hex')}`;
      await this.prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          stripeEventId,
          amountCents: plan.priceCents,
          status: 'SUCCEEDED',
        },
      });
      this.logger.log(
        `Stub Stripe charge for org ${organizationId}: ${plan.priceCents} cents for plan ${plan.key} (event ${stripeEventId})`,
      );
    }

    const detail = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: subscriptionInclude,
    });
    return this.toDetail(detail);
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toDetail(subscription: SubscriptionWithRelations | null) {
    return {
      id: subscription?.id ?? null,
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      plan: subscription
        ? {
            key: subscription.plan.key,
            name: subscription.plan.name,
            maxActiveJobs: subscription.plan.maxActiveJobs,
            maxSeats: subscription.plan.maxSeats,
            priceCents: subscription.plan.priceCents,
          }
        : null,
      payments: (subscription?.payments ?? []).map((payment) => ({
        id: payment.id,
        amountCents: payment.amountCents,
        status: payment.status,
        createdAt: payment.createdAt,
      })),
    };
  }
}
