'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Divider, Field, Input } from '@/components/ui';
import { OnboardingPanel } from '@/components/OnboardingPanel';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Offer, OrgApplication } from '@/lib/types';

export default function CreateOfferPage() {
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<OrgApplication | null>(null);
  const [existingOffer, setExistingOffer] = useState<Offer | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [title, setTitle] = useState('');
  const [compensation, setCompensation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<OrgApplication>(`/jobs/${id}/applications/${appId}`).then((app) => {
      setApplication(app);
      setTitle(app.stage.name);
    });
    api
      .get<Offer>(`/jobs/${id}/applications/${appId}/offer`)
      .then(setExistingOffer)
      .catch(() => setExistingOffer(null))
      .finally(() => setLoaded(true));
  }, [id, appId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const offer = await api.post<Offer>(`/jobs/${id}/applications/${appId}/offer`, {
        title,
        compensation: compensation || undefined,
        startDate: startDate || undefined,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setExistingOffer(offer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!application || !loaded) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[520px] px-10 py-9">
      <button onClick={() => router.back()} className="mb-4 text-[13px] font-semibold text-ink-soft">
        ← Back
      </button>
      <h1 className="mb-1 font-display text-[22px] font-extrabold text-ink">
        {existingOffer ? 'Offer' : 'New Offer'}
      </h1>
      <p className="mb-6 text-[13px] text-ink-soft">For {application.candidate.fullName}</p>

      {existingOffer ? (
        <Card>
          <div className="mb-4 flex justify-end">
            <Badge variant="success">{existingOffer.status}</Badge>
          </div>
          <div className="flex flex-col gap-3 text-[13.5px]">
            <div className="flex justify-between">
              <span className="text-ink-soft">Role</span>
              <span className="font-semibold text-ink">{existingOffer.title}</span>
            </div>
            <Divider />
            <div className="flex justify-between">
              <span className="text-ink-soft">Compensation</span>
              <span className="font-semibold text-ink">{existingOffer.compensation ?? '—'}</span>
            </div>
            <Divider />
            <div className="flex justify-between">
              <span className="text-ink-soft">Start date</span>
              <span className="font-semibold text-ink">{formatDate(existingOffer.startDate)}</span>
            </div>
            <Divider />
            <div className="flex justify-between">
              <span className="text-ink-soft">Expires</span>
              <span className="font-semibold text-ink">{formatDate(existingOffer.expiresAt)}</span>
            </div>
          </div>
        </Card>
      ) : null}

      {existingOffer?.status === 'ACCEPTED' && (
        <div className="mt-4">
          <OnboardingPanel basePath={`/jobs/${id}/applications/${appId}/onboarding`} mode="org" />
        </div>
      )}

      {!existingOffer && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Job title">
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Compensation">
              <Input value={compensation} onChange={(e) => setCompensation(e.target.value)} placeholder="$150,000/year" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start date">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Offer expires">
                <Input type="date" required value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            </div>
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Offer'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
