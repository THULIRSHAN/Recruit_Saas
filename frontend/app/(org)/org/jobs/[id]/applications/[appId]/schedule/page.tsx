'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { OrgMember } from '@/lib/types';

const MODES = ['VIDEO', 'ONSITE', 'PHONE'] as const;

export default function ScheduleInterviewPage() {
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const router = useRouter();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mode, setMode] = useState<(typeof MODES)[number]>('VIDEO');
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<OrgMember[]>('/organizations/me/members').then(setMembers);
  }, []);

  function toggleInterviewer(userId: string) {
    setInterviewerIds((prev) =>
      prev.includes(userId) ? prev.filter((id2) => id2 !== userId) : [...prev, userId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!date || !time) throw new Error('Date and time are required.');
      if (interviewerIds.length === 0) throw new Error('Select at least one interviewer.');
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      await api.post(`/jobs/${id}/applications/${appId}/interviews`, {
        scheduledAt,
        mode,
        interviewerIds,
      });
      router.push(`/org/jobs/${id}/applications/${appId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[520px] px-10 py-9">
      <h1 className="mb-6 font-display text-[22px] font-extrabold text-ink">Schedule Interview</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Mode">
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                    mode === m ? 'border-accent bg-accent text-white' : 'border-border text-ink-soft'
                  }`}
                >
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Interview panel">
            <div className="flex flex-col gap-2">
              {members.map((member) => (
                <label key={member.id} className="flex items-center gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={interviewerIds.includes(member.id)}
                    onChange={() => toggleInterviewer(member.id)}
                  />
                  {member.fullName}
                  <span className="text-ink-faint">({member.roles.join(', ')})</span>
                </label>
              ))}
            </div>
          </Field>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Scheduling…' : 'Schedule Interview'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
