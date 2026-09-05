'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Divider } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Application } from '@/lib/types';

const STATUS_BADGE: Record<string, 'accent' | 'neutral' | 'danger' | 'success'> = {
  ACTIVE: 'accent',
  WITHDRAWN: 'neutral',
  REJECTED: 'danger',
  HIRED: 'success',
};

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  useEffect(() => {
    api.get<Application>(`/applications/${id}`).then(setApplication).catch(() => setApplication(null));
  }, [id]);

  async function handleWithdraw() {
    if (!application) return;
    setWithdrawing(true);
    try {
      const updated = await api.post<Application>(`/applications/${application.id}/withdraw`);
      setApplication(updated);
      setConfirmingWithdraw(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setWithdrawing(false);
    }
  }

  if (!application) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] gap-8 px-10 py-9">
      <div className="flex-1">
        <button
          onClick={() => router.push('/dashboard/applications')}
          className="mb-4 text-[13px] font-semibold text-ink-soft"
        >
          ← Back to applications
        </button>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="font-display text-[22px] font-extrabold text-ink">{application.job.title}</h1>
          <Badge variant={STATUS_BADGE[application.status]}>{application.stage.name}</Badge>
        </div>
        <p className="mb-6 text-[13px] text-ink-soft">{application.job.organization.name}</p>

        {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}

        <Card className="mb-4">
          <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            Cover note
          </div>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            {application.coverNote || 'No cover note submitted.'}
          </p>
        </Card>

        <Card className="mb-4">
          <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            Timeline
          </div>
          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-ink-soft">Applied</span>
              <span className="font-semibold text-ink">{formatDate(application.appliedAt)}</span>
            </div>
            <Divider />
            <div className="flex justify-between">
              <span className="text-ink-soft">Current stage</span>
              <span className="font-semibold text-ink">{application.stage.name}</span>
            </div>
            <Divider />
            <div className="flex justify-between">
              <span className="text-ink-soft">Last updated</span>
              <span className="font-semibold text-ink">{formatDate(application.updatedAt)}</span>
            </div>
          </div>
        </Card>

        {application.status === 'HIRED' && (
          <Link href={`/dashboard/offers/${application.id}`}>
            <Button variant="success">View your offer</Button>
          </Link>
        )}
        {application.status === 'ACTIVE' && (
          <Button variant="danger" onClick={() => setConfirmingWithdraw(true)}>
            Withdraw application
          </Button>
        )}
      </div>

      <div className="w-[260px] shrink-0">
        <Card>
          <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            Submitted CV
          </div>
          <p className="text-[13px] text-ink">{application.cv.fileName}</p>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmingWithdraw}
        title="Withdraw this application?"
        description={`You won't be able to reapply to ${application.job.title} while this application is active.`}
        confirmLabel="Withdraw"
        variant="danger"
        confirming={withdrawing}
        onConfirm={handleWithdraw}
        onCancel={() => setConfirmingWithdraw(false)}
      />
    </div>
  );
}
