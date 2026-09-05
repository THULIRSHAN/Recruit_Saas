'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CheckIcon, ConfirmDialog, DownloadIcon, Select, Stars } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type {
  ApplicationStageHistoryEntry,
  Evaluation,
  OrgApplication,
  RecruitmentStage,
  TalentPool,
} from '@/lib/types';

const RECOMMENDATION_LABEL: Record<string, string> = {
  STRONG_YES: 'Strong Yes',
  YES: 'Yes',
  NO: 'No',
  STRONG_NO: 'Strong No',
};

export default function ApplicationDetailPage() {
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<OrgApplication | null>(null);
  const [stages, setStages] = useState<RecruitmentStage[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [history, setHistory] = useState<ApplicationStageHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState<'screen' | 'decide' | null>(null);

  function load() {
    api.get<OrgApplication>(`/jobs/${id}/applications/${appId}`).then(setApplication);
    api.get<RecruitmentStage[]>(`/jobs/${id}/stages`).then((s) => setStages(s.sort((a, b) => a.order - b.order)));
    api.get<Evaluation[]>(`/jobs/${id}/applications/${appId}/evaluations`).then(setEvaluations);
    api.get<ApplicationStageHistoryEntry[]>(`/jobs/${id}/applications/${appId}/history`).then(setHistory);
  }

  useEffect(load, [id, appId]);

  async function downloadCv() {
    const { url } = await api.get<{ url: string; expiresAt: string }>(
      `/jobs/${id}/applications/${appId}/cv/signed-url`,
    );
    // Relative path from the backend (see LocalStorageService.getSignedUrl) --
    // the browser needs the backend's own origin, not the frontend's.
    window.open(`${process.env.NEXT_PUBLIC_API_URL}${url}`, '_blank');
  }

  const currentStageIndex = stages.findIndex((s) => s.id === application?.stage.id);
  const isFinalStage = currentStageIndex >= 0 && currentStageIndex === stages.length - 1;

  async function screen(decision: 'PASS' | 'REJECT') {
    setActing(true);
    setError(null);
    try {
      const updated = await api.post<OrgApplication>(`/jobs/${id}/applications/${appId}/screen`, {
        decision,
      });
      setApplication(updated);
      setConfirmingReject(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setActing(false);
    }
  }

  async function decide(decision: 'HIRE' | 'REJECT') {
    setActing(true);
    setError(null);
    try {
      const updated = await api.post<OrgApplication>(`/jobs/${id}/applications/${appId}/decide`, {
        decision,
      });
      setApplication(updated);
      setConfirmingReject(null);
      if (decision === 'HIRE') {
        router.push(`/org/jobs/${id}/applications/${appId}/offer`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setActing(false);
    }
  }

  if (!application) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] gap-8 px-10 py-9">
      <div className="flex-1">
        <button
          onClick={() => router.push(`/org/jobs/${id}/pipeline`)}
          className="mb-4 text-[13px] font-semibold text-ink-soft"
        >
          ← Back to pipeline
        </button>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="font-display text-[22px] font-extrabold text-ink">
            {application.candidate.fullName}
          </h1>
          <Badge variant={application.status === 'ACTIVE' ? 'accent' : application.status === 'HIRED' ? 'success' : 'danger'}>
            {application.status === 'ACTIVE' ? application.stage.name : application.status}
          </Badge>
        </div>
        <p className="mb-6 text-[13px] text-ink-soft">
          {application.candidate.email}
          {application.candidate.phone && <> · {application.candidate.phone}</>}
        </p>

        {stages.length > 0 && (
          <Card className="mb-4">
            <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Pipeline progress</div>
            <div className="flex items-center gap-2">
              {stages.map((stage, i) => (
                <div key={stage.id} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      i < currentStageIndex
                        ? 'bg-success text-white'
                        : i === currentStageIndex
                          ? 'bg-accent text-white'
                          : 'bg-surface-alt text-ink-faint'
                    }`}
                  >
                    {i < currentStageIndex ? <CheckIcon size={12} /> : i + 1}
                  </div>
                  <span className={`text-[11.5px] ${i === currentStageIndex ? 'font-bold text-ink' : 'text-ink-soft'}`}>
                    {stage.name}
                  </span>
                  {i < stages.length - 1 && <div className="h-px flex-1 bg-border" />}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="mb-4">
          <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Cover note</div>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            {application.coverNote || 'No cover note submitted.'}
          </p>
        </Card>

        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">Evaluations</span>
            <Link href={`/org/jobs/${id}/applications/${appId}/schedule`} className="text-[12px] font-bold text-accent">
              Schedule interview
            </Link>
          </div>
          {evaluations.length === 0 ? (
            <p className="text-[13px] text-ink-faint">No evaluations submitted yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {evaluations.map((ev) => (
                <div key={ev.id} className="rounded-[9px] border border-border p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[13px] font-bold text-ink">{ev.interviewer.fullName}</span>
                    <Badge variant={ev.recommendation.includes('YES') ? 'success' : 'danger'}>
                      {RECOMMENDATION_LABEL[ev.recommendation]}
                    </Badge>
                  </div>
                  <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1.5">
                    {Object.entries(ev.scores).map(([key, score]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="text-[11.5px] text-ink-soft">{key}</span>
                        <Stars value={score} size={11} />
                      </div>
                    ))}
                  </div>
                  {ev.comment && <p className="text-[12.5px] text-ink-soft">{ev.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}

        {application.status === 'ACTIVE' && !isFinalStage && (
          <div className="flex gap-3">
            <Button variant="success" disabled={acting} onClick={() => screen('PASS')}>
              Advance to next stage
            </Button>
            <Button variant="danger" disabled={acting} onClick={() => setConfirmingReject('screen')}>
              Reject candidate
            </Button>
          </div>
        )}
        {application.status === 'ACTIVE' && isFinalStage && (
          <div className="flex gap-3">
            <Button variant="success" disabled={acting} onClick={() => decide('HIRE')}>
              Advance to Offer
            </Button>
            <Button variant="danger" disabled={acting} onClick={() => setConfirmingReject('decide')}>
              Reject candidate
            </Button>
          </div>
        )}
        {application.status === 'HIRED' && (
          <Link href={`/org/jobs/${id}/applications/${appId}/offer`}>
            <Button variant="success">Create offer</Button>
          </Link>
        )}
      </div>

      <div className="w-[260px] shrink-0">
        <Card className="mb-4">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Submitted CV</div>
          <button onClick={downloadCv} className="flex items-center gap-1.5 text-[13px] font-bold text-accent">
            <DownloadIcon size={13} />
            {application.cv.fileName}
          </button>
        </Card>
        <Card className="mb-4">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Application details</div>
          <p className="mb-2 text-[12.5px] text-ink-soft">Applied {formatDate(application.appliedAt)}</p>
          <Link href={`/org/jobs/${id}/edit`} className="text-[12px] font-bold text-accent">
            View job posting →
          </Link>
        </Card>

        {history.length > 0 && (
          <Card className="mb-4">
            <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Activity</div>
            <div className="flex flex-col gap-3">
              {history.map((entry) => (
                <div key={entry.id} className="text-[12.5px]">
                  <p className="text-ink">
                    <span className="font-bold">{entry.movedBy?.fullName ?? 'Someone'}</span> moved this candidate
                    {entry.fromStage ? ` from ${entry.fromStage.name}` : ''} to{' '}
                    <span className="font-bold">{entry.toStage?.name}</span>
                  </p>
                  <p className="text-ink-faint">{formatDateTime(entry.movedAt)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <AddToTalentPool candidateId={application.candidate.id} />
      </div>

      <ConfirmDialog
        open={confirmingReject !== null}
        title="Reject this candidate?"
        description={`${application.candidate.fullName} will be marked as rejected and removed from this job's active pipeline.`}
        confirmLabel="Reject"
        variant="danger"
        confirming={acting}
        onConfirm={() => (confirmingReject === 'screen' ? screen('REJECT') : decide('REJECT'))}
        onCancel={() => setConfirmingReject(null)}
      />
    </div>
  );
}

function AddToTalentPool({ candidateId }: { candidateId: string }) {
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.get<TalentPool[]>('/talent-pools').then(setPools);
  }, []);

  async function add() {
    if (!selected) return;
    setAdding(true);
    setStatus(null);
    try {
      await api.post(`/talent-pools/${selected}/candidates`, { candidateId });
      setStatus('Added.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setAdding(false);
    }
  }

  if (pools.length === 0) return null;

  return (
    <Card>
      <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Talent pool</div>
      <div className="flex gap-2">
        <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose a pool…</option>
          {pools.map((pool) => (
            <option key={pool.id} value={pool.id}>
              {pool.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={add} disabled={!selected || adding}>
          Add
        </Button>
      </div>
      {status && <p className="mt-2 text-[11.5px] text-ink-soft">{status}</p>}
    </Card>
  );
}
