import { BillingSettings } from '@/components/org/BillingSettings';

export default function SubscriptionPage() {
  return (
    <div className="mx-auto w-full max-w-[800px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Subscription</h1>
      <BillingSettings />
    </div>
  );
}
