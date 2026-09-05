'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Plan, Subscription } from '@/lib/types';

function formatPrice(cents: number): string {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(0)}/mo`;
}

export function BillingSettings() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  function load() {
    api.get<Plan[]>('/plans').then(setPlans);
    api.get<Subscription>('/organizations/me/subscription').then(setSubscription);
  }

  useEffect(load, []);

  async function selectPlan(planKey: string) {
    setSelecting(planKey);
    setError(null);
    try {
      const updated = await api.post<Subscription>('/organizations/me/subscription', { planKey });
      setSubscription(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSelecting(null);
    }
  }

  if (!plans) {
    return <div className="text-ink-soft">Loading…</div>;
  }

  return (
    <>
      <p className="mb-6 text-[13px] text-ink-soft">
        {subscription?.plan
          ? `Currently on the ${subscription.plan.name} plan.`
          : "You haven't selected a plan yet."}
        {subscription?.currentPeriodEnd && ` Current period ends ${formatDate(subscription.currentPeriodEnd)}.`}
      </p>

      {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}

      <div className="grid grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = subscription?.plan?.key === plan.key;
          return (
            <Card key={plan.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-ink">{plan.name}</span>
                {isCurrent && <Badge variant="accent">Current</Badge>}
              </div>
              <div className="font-display text-[22px] font-extrabold text-ink">
                {formatPrice(plan.priceCents)}
              </div>
              <div className="flex flex-col gap-1 text-[12.5px] text-ink-soft">
                <span>{plan.maxActiveJobs ? `${plan.maxActiveJobs} active jobs` : 'Unlimited active jobs'}</span>
                <span>{plan.maxSeats ? `${plan.maxSeats} seats` : 'Unlimited seats'}</span>
              </div>
              <Button
                size="sm"
                variant={isCurrent ? 'secondary' : 'primary'}
                disabled={isCurrent || selecting === plan.key}
                onClick={() => selectPlan(plan.key)}
              >
                {isCurrent ? 'Current plan' : selecting === plan.key ? 'Selecting…' : 'Select plan'}
              </Button>
            </Card>
          );
        })}
      </div>

      {subscription?.plan && (
        <Card className="mt-8">
          <h2 className="mb-1 text-[15px] font-bold text-ink">Payment method</h2>
          <p className="text-[12.5px] text-ink-faint">
            Stripe test mode — no real payment method is charged (see docs/open-questions.md Q29).
          </p>
        </Card>
      )}

      {subscription && subscription.payments.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-[15px] font-bold text-ink">Invoice history</h2>
          <Card padded={false} className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border-soft bg-surface-alt text-left text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {subscription.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-2.5 text-ink-soft">{formatDate(payment.createdAt)}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink">
                      ${(payment.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={payment.status === 'SUCCEEDED' ? 'success' : 'danger'}>
                        {payment.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
