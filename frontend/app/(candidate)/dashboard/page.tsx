'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Badge,
  CalendarIcon,
  Card,
  ChevronRightIcon,
  EmptyState,
  GiftIcon,
  InboxIcon,
  StatCard,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Application, CandidateProfile, PaginatedResponse } from '@/lib/types';

const STAGE_BADGE: Record<string, 'accent' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  ACTIVE: 'accent',
  WITHDRAWN: 'neutral',
  REJECTED: 'danger',
  HIRED: 'success',
};

export default function CandidateDashboardPage() {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    api.get<PaginatedResponse<Application>>('/applications/me').then((res) => setApplications(res.data));
    api.get<CandidateProfile>('/candidates/me').then(setProfile);
  }, []);

  const active = applications?.filter((a) => a.status === 'ACTIVE').length ?? 0;
  const hired = applications?.filter((a) => a.status === 'HIRED').length ?? 0;

  const completionFields = profile
    ? [profile.headline, profile.location, profile.phone, profile.cvs.length > 0, profile.experience.length > 0, profile.skills.length > 0]
    : [];
  const completion = completionFields.length
    ? Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] gap-8 px-10 py-9">
      <div className="flex-1">
        <h1 className="font-display text-[26px] font-extrabold text-ink">Welcome back</h1>
        <p className="mt-1 mb-6 text-[13.5px] text-ink-soft">
          Here&rsquo;s where things stand with your applications.
        </p>

        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatCard label="Active applications" value={active} icon={<InboxIcon size={15} />} tone="accent" />
          <StatCard
            label="Interview stage"
            value={applications?.filter((a) => a.stage.name.toLowerCase().includes('interview')).length ?? 0}
            icon={<CalendarIcon size={15} />}
            tone="info"
          />
          <StatCard label="Offers received" value={hired} icon={<GiftIcon size={15} />} tone="success" />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">Recent Applications</h2>
          <Link href="/dashboard/applications" className="text-[12.5px] font-bold text-accent">
            View all
          </Link>
        </div>

        {applications === null ? null : applications.length === 0 ? (
          <EmptyState
            icon={<InboxIcon />}
            title="No applications yet"
            description="Browse open roles and apply to get started."
            action={
              <Link href="/" className="text-[13px] font-bold text-accent">
                Browse jobs
              </Link>
            }
          />
        ) : (
          <Card padded={false} className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border-soft bg-surface-alt text-left text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                  <th className="px-4 py-2.5">Job</th>
                  <th className="px-4 py-2.5">Applied</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {applications.slice(0, 5).map((app) => (
                  <tr key={app.id} className="border-b border-border-soft last:border-0 hover:bg-surface-alt">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/applications/${app.id}`} className="font-bold text-accent">
                        {app.job.title}
                      </Link>
                      <div className="text-ink-faint">{app.job.organization.name}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(app.appliedAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STAGE_BADGE[app.status]}>{app.stage.name}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(app.updatedAt)}</td>
                    <td className="px-4 py-3 text-ink-faint">
                      <Link href={`/dashboard/applications/${app.id}`}>
                        <ChevronRightIcon />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="w-[280px] shrink-0">
        <Card>
          <div className="mb-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            Profile completion
          </div>
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-accent" style={{ width: `${completion}%` }} />
          </div>
          <div className="text-[12.5px] text-ink-soft">{completion}% complete</div>
          <Link href="/dashboard/profile" className="mt-3 block text-[12.5px] font-bold text-accent">
            Complete your profile
          </Link>
        </Card>
      </div>
    </div>
  );
}
