'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CalendarIcon, EmptyState, Stars, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { EvaluationRecommendation, MyInterview, PaginatedResponse } from '@/lib/types';

const COMPETENCIES = ['Technical Skill', 'Communication', 'Culture Fit'];
const RECOMMENDATIONS: { key: EvaluationRecommendation; label: string }[] = [
  { key: 'STRONG_NO', label: 'Strong No' },
  { key: 'NO', label: 'No' },
  { key: 'YES', label: 'Yes' },
  { key: 'STRONG_YES', label: 'Strong Yes' },
];

export default function InterviewerPage() {
  const [interviews, setInterviews] = useState<MyInterview[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<EvaluationRecommendation>('YES');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<PaginatedResponse<MyInterview>>('/interviews/me', { pageSize: 100 }).then((res) => {
      setInterviews(res.data);
      if (res.data.length > 0) setSelectedId(res.data[0].id);
    });
  }, []);

  const selected = interviews?.find((i) => i.id === selectedId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/interviews/${selectedId}/evaluation`, {
        scores,
        recommendation,
        comment: comment || undefined,
      });
      setSuccess('Evaluation submitted.');
      setScores({});
      setComment('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (interviews === null) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] gap-6 px-10 py-9">
      <div className="w-[320px] shrink-0">
        <h1 className="mb-4 font-display text-[20px] font-extrabold text-ink">My Interviews</h1>
        {interviews.length === 0 ? (
          <EmptyState icon={<CalendarIcon />} title="No interviews assigned" description="You'll see interviews here once you're added to a panel." />
        ) : (
          <div className="flex flex-col gap-2">
            {interviews.map((interview) => (
              <button
                key={interview.id}
                onClick={() => setSelectedId(interview.id)}
                className={`rounded-lg border p-3 text-left ${
                  selectedId === interview.id ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                }`}
              >
                <div className="text-[13px] font-bold text-ink">
                  {interview.application.candidate.fullName}
                </div>
                <div className="text-[12px] text-ink-soft">{interview.application.job.title}</div>
                <div className="mt-1 text-[11.5px] text-ink-faint">{formatDateTime(interview.scheduledAt)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex-1">
          <Card>
            <h2 className="mb-1 text-[16px] font-bold text-ink">
              Evaluate {selected.application.candidate.fullName}
            </h2>
            <p className="mb-5 text-[12.5px] text-ink-soft">{selected.application.job.title}</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {COMPETENCIES.map((competency) => (
                <div key={competency} className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink">{competency}</span>
                  <Stars
                    value={scores[competency] ?? 0}
                    onChange={(v) => setScores((prev) => ({ ...prev, [competency]: v }))}
                    size={20}
                  />
                </div>
              ))}
              <div>
                <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                  Overall recommendation
                </div>
                <div className="flex gap-2">
                  {RECOMMENDATIONS.map((r) => (
                    <button
                      type="button"
                      key={r.key}
                      onClick={() => setRecommendation(r.key)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                        recommendation === r.key ? 'border-accent bg-accent text-white' : 'border-border text-ink-soft'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Comments</div>
                <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              {error && <p className="text-[12.5px] text-danger">{error}</p>}
              {success && <p className="text-[12.5px] text-success">{success}</p>}
              <Button type="submit" disabled={submitting || Object.keys(scores).length < COMPETENCIES.length}>
                {submitting ? 'Submitting…' : 'Submit Evaluation'}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
