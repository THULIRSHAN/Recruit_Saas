'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, BriefcaseIcon, Button, Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Job, PaginatedResponse } from '@/lib/types';

const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'danger' | 'warning'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CLOSED: 'warning',
  ARCHIVED: 'neutral',
};

export default function JobsListPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    api.get<PaginatedResponse<Job>>('/jobs', { pageSize: 100 }).then((res) => setJobs(res.data));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-10 py-9">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-[24px] font-extrabold text-ink">Jobs</h1>
        <Link href="/org/jobs/new">
          <Button>Post a Job</Button>
        </Link>
      </div>

      {jobs === null ? null : jobs.length === 0 ? (
        <EmptyState icon={<BriefcaseIcon />} title="No jobs yet" description="Post your first job to start receiving applications." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border-soft bg-surface-alt text-left text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-border-soft last:border-0 hover:bg-surface-alt">
                  <td className="px-4 py-3 font-bold text-ink">{job.title}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[job.status]}>{job.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(job.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/org/jobs/${job.id}/pipeline`} className="mr-3 font-bold text-accent">
                      Pipeline
                    </Link>
                    <Link href={`/org/jobs/${job.id}/edit`} className="font-bold text-ink-soft">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
