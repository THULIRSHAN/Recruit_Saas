'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Divider } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Offer } from '@/lib/types';

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  SENT: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'neutral',
};

export default function OfferReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<Offer>(`/applications/${id}/offer`)
      .then(setOffer)
      .catch(() => setOffer(null));
  }, [id]);

  async function respond(decision: 'ACCEPT' | 'DECLINE') {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.post<Offer>(`/applications/${id}/offer/respond`, { decision });
      setOffer(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (offer === null) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-10 py-16">
      <Card className="w-full">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-[20px] text-success">
            ✓
          </div>
          <h1 className="text-[18px] font-bold text-ink">You have an offer</h1>
          <Badge variant={STATUS_BADGE[offer.status]}>{offer.status}</Badge>
        </div>

        <div className="flex flex-col gap-3 text-[13.5px]">
          <div className="flex justify-between">
            <span className="text-ink-soft">Role</span>
            <span className="font-semibold text-ink">{offer.title}</span>
          </div>
          <Divider />
          <div className="flex justify-between">
            <span className="text-ink-soft">Compensation</span>
            <span className="font-semibold text-ink">{offer.compensation ?? '—'}</span>
          </div>
          <Divider />
          <div className="flex justify-between">
            <span className="text-ink-soft">Start date</span>
            <span className="font-semibold text-ink">{formatDate(offer.startDate)}</span>
          </div>
          <Divider />
          <div className="flex justify-between">
            <span className="text-ink-soft">Respond by</span>
            <span className="font-semibold text-ink">{formatDate(offer.expiresAt)}</span>
          </div>
        </div>

        {error && <p className="mt-4 text-[12.5px] text-danger">{error}</p>}

        {offer.status === 'SENT' && (
          <div className="mt-6 flex gap-3">
            <Button variant="success" block disabled={submitting} onClick={() => respond('ACCEPT')}>
              Accept offer
            </Button>
            <Button variant="secondary" block disabled={submitting} onClick={() => respond('DECLINE')}>
              Decline
            </Button>
          </div>
        )}
        {offer.status !== 'SENT' && (
          <Button
            variant="secondary"
            block
            className="mt-6"
            onClick={() => router.push('/dashboard')}
          >
            Back to dashboard
          </Button>
        )}
      </Card>
    </div>
  );
}
