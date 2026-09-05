'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  BriefcaseIcon,
  Button,
  CalendarIcon,
  Card,
  EmptyState,
  GiftIcon,
  ListIcon,
  StatCard,
  UsersIcon,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { MyInterview, OrgApplication, PaginatedResponse } from '@/lib/types';

interface OrgAnalytics {
  jobs: { total: number; byStatus: Record<string, number> };
  applications: { total: number; byStatus: Record<string, number> };
  interviews: { total: number; byStatus: Record<string, number> };
  offers: { total: number; byStatus: Record<string, number> };
}

export default function OrgDashboardPage() {
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [applications, setApplications] = useState<OrgApplication[] | null>(null);
  const [interviews, setInterviews] = useState<MyInterview[] | null>(null);

  useEffect(() => {
    api.get<OrgAnalytics>('/organizations/me/analytics').then(setAnalytics);
    api
      .get<PaginatedResponse<OrgApplication>>('/organizations/me/applications', { pageSize: 5 })
      .then((res) => setApplications(res.data));
    api
      .get<PaginatedResponse<MyInterview>>('/organizations/me/interviews', { pageSize: 5 })
      .then((res) => setInterviews(res.data));
  }, []);

  const applicationSegments = analytics
    ? Object.entries(analytics.applications.byStatus).filter(([, count]) => count > 0)
    : [];
  const maxSegment = Math.max(1, ...applicationSegments.map(([, count]) => count));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-10 py-9">
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

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {applicationSegments.length > 0 && (
            <Card className="mb-6">
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
            <h2 className="text-[15px] font-bold text-ink">Recent Applications</h2>
          </div>

          {applications === null ? null : applications.length === 0 ? (
            <EmptyState
              icon={<ListIcon />}
              title="No applications yet"
              description="Applications will show up here once candidates start applying to your jobs."
            />
          ) : (
            <Card padded={false} className="overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border-soft text-left text-[10.5px] font-bold tracking-wide text-ink-faint uppercase">
                    <th className="px-4 py-2.5">Candidate</th>
                    <th className="px-4 py-2.5">Job</th>
                    <th className="px-4 py-2.5">Stage</th>
                    <th className="px-4 py-2.5">Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id} className="border-b border-border-soft last:border-0 hover:bg-surface-alt">
                      <td className="px-4 py-3">
                        <Link
                          href={`/org/jobs/${application.job.id}/applications/${application.id}`}
                          className="flex items-center gap-2.5 font-bold text-ink"
                        >
                          <Avatar name={application.candidate.fullName} size={26} />
                          {application.candidate.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{application.job.title}</td>
                      <td className="px-4 py-3">
                        <Badge variant="accent">{application.stage.name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-faint">{formatDate(application.appliedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="w-[300px] shrink-0 flex flex-col gap-6">
          <Card>
            <h2 className="mb-3 text-[15px] font-bold text-ink">Upcoming Interviews</h2>
            {interviews === null ? null : interviews.length === 0 ? (
              <p className="text-[12.5px] text-ink-soft">No interviews scheduled.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border-soft">
                {interviews.map((interview) => (
                  <div key={interview.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar name={interview.application.candidate.fullName} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-ink">
                        {interview.application.candidate.fullName}
                      </div>
                      <div className="text-[11.5px] text-ink-faint">{formatDateTime(interview.scheduledAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-[15px] font-bold text-ink">Quick actions</h2>
            <div className="flex flex-col gap-2">
              <Link href="/org/jobs/new" className="block">
                <Button block>Post a Job</Button>
              </Link>
              <Link href="/org/team" className="block">
                <Button variant="secondary" block>
                  <UsersIcon size={14} />
                  Invite teammate
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
