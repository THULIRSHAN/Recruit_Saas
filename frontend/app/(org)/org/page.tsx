'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Badge,
  BriefcaseIcon,
  Button,
  CalendarIcon,
  Card,
  EmptyState,
  GiftIcon,
  ListIcon,
  StatCard,
} from '@/components/ui';
import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/types';

interface OrgAnalytics {
  jobs: { total: number; byStatus: Record<string, number> };
  applications: { total: number; byStatus: Record<string, number> };
  interviews: { total: number; byStatus: Record<string, number> };
  offers: { total: number; byStatus: Record<string, number> };
}

interface OrgJob {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
}

const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'danger' | 'warning'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CLOSED: 'warning',
  ARCHIVED: 'neutral',
};

export default function OrgDashboardPage() {
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [jobs, setJobs] = useState<OrgJob[] | null>(null);

  useEffect(() => {
    api.get<OrgAnalytics>('/organizations/me/analytics').then(setAnalytics);
    api.get<PaginatedResponse<OrgJob>>('/jobs', { pageSize: 5 }).then((res) => setJobs(res.data));
  }, []);

  const applicationSegments = analytics
    ? Object.entries(analytics.applications.byStatus).filter(([, count]) => count > 0)
    : [];
  const maxSegment = Math.max(1, ...applicationSegments.map(([, count]) => count));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-10 py-9">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-extrabold text-ink">Dashboard</h1>
          <p className="text-[13px] text-ink-soft">Your hiring activity at a glance.</p>
        </div>
        <Link href="/org/jobs/new">
          <Button>Post a Job</Button>
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">
        <StatCard label="Active jobs" value={analytics?.jobs.byStatus.PUBLISHED ?? 0} icon={<BriefcaseIcon size={15} />} tone="accent" />
        <StatCard label="Total applicants" value={analytics?.applications.total ?? 0} icon={<ListIcon size={15} />} tone="info" />
        <StatCard label="Interviews" value={analytics?.interviews.total ?? 0} icon={<CalendarIcon size={15} />} tone="warning" />
        <StatCard label="Offers" value={analytics?.offers.total ?? 0} icon={<GiftIcon size={15} />} tone="success" />
      </div>

      {applicationSegments.length > 0 && (
        <Card className="mb-8">
          <h2 className="mb-3 text-[15px] font-bold text-ink">Applications by status</h2>
          <div className="flex flex-col gap-2">
            {applicationSegments.map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-24 text-[12px] font-semibold text-ink-soft">{status}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(count / maxSegment) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[12px] font-bold text-ink">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Your jobs</h2>
        <Link href="/org/jobs" className="text-[12.5px] font-bold text-accent">
          View all
        </Link>
      </div>

      {jobs === null ? null : jobs.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon />}
          title="No jobs yet"
          description="Post your first job to start receiving applications."
          action={
            <Link href="/org/jobs/new">
              <Button size="sm">Post a Job</Button>
            </Link>
          }
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-[13px]">
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-border-soft last:border-0 hover:bg-surface-alt">
                  <td className="px-4 py-3">
                    <Link href={`/org/jobs/${job.id}/pipeline`} className="font-bold text-accent">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={STATUS_BADGE[job.status]}>{job.status}</Badge>
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
