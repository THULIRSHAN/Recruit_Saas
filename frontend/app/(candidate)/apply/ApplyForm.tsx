'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getPublicJob } from '@/lib/public-jobs';
import type { Application, CandidateProfile } from '@/lib/types';
import type { PublicJob } from '@/lib/types';

export function ApplyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('job') ?? '';

  const [job, setJob] = useState<PublicJob | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [selectedCvId, setSelectedCvId] = useState<string>('');
  const [coverNote, setCoverNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    getPublicJob(jobId).then(setJob);
    api.get<CandidateProfile>('/candidates/me').then((p) => {
      setProfile(p);
      const primary = p.cvs.find((cv) => cv.isPrimary) ?? p.cvs[0];
      if (primary) setSelectedCvId(primary.id);
    });
  }, [jobId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const application = await api.post<Application>('/applications', {
        jobId,
        cvId: selectedCvId || undefined,
        coverNote: coverNote || undefined,
      });
      router.push(`/dashboard/applications/${application.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!jobId) {
    return <div className="px-10 py-9 text-ink-soft">No job selected.</div>;
  }
  if (!job || !profile) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] gap-8 px-10 py-9">
      <form onSubmit={handleSubmit} className="flex-1">
        <h1 className="mb-1 font-display text-[22px] font-extrabold text-ink">Apply to {job.title}</h1>
        <p className="mb-6 text-[13px] text-ink-soft">{job.organization.name}</p>

        <Card className="mb-4">
          <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            Choose a CV
          </div>
          {profile.cvs.length === 0 ? (
            <p className="text-[13px] text-danger">
              You need to upload a CV before applying — do that from your profile first.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {profile.cvs.map((cv) => (
                <label
                  key={cv.id}
                  className={`flex cursor-pointer items-center justify-between rounded-[9px] border px-3.5 py-2.5 text-[13px] ${
                    selectedCvId === cv.id ? 'border-accent bg-accent-soft' : 'border-border'
                  }`}
                >
                  <span>
                    {cv.fileName} {cv.isPrimary && <span className="text-ink-faint">(Primary)</span>}
                  </span>
                  <input
                    type="radio"
                    name="cv"
                    checked={selectedCvId === cv.id}
                    onChange={() => setSelectedCvId(cv.id)}
                  />
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className="mb-4">
          <div className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            Cover note (optional)
          </div>
          <textarea
            value={coverNote}
            onChange={(e) => setCoverNote(e.target.value)}
            rows={6}
            className="w-full rounded-[9px] border border-border p-3 text-[13.5px] outline-none focus:border-accent"
            placeholder="Tell them why you're a great fit…"
          />
        </Card>

        {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || profile.cvs.length === 0}>
            {submitting ? 'Submitting…' : 'Submit Application'}
          </Button>
        </div>
      </form>

      <div className="w-[260px] shrink-0">
        <Card>
          <div className="mb-2 text-[12.5px] font-bold text-ink">What happens next</div>
          <p className="text-[12.5px] text-ink-soft">
            The hiring team will review your application and reach out if there&rsquo;s a match. You
            can track its status any time from your dashboard.
          </p>
        </Card>
      </div>
    </div>
  );
}
