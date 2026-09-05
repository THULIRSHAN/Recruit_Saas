'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, InboxIcon } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Application, PaginatedResponse } from '@/lib/types';

const STAGE_BADGE: Record<string, 'accent' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  ACTIVE: 'accent',
  WITHDRAWN: 'neutral',
  REJECTED: 'danger',
  HIRED: 'success',
};

export default function ApplicationsListPage() {
  const [applications, setApplications] = useState<Application[] | null>(null);

  useEffect(() => {
    api.get<PaginatedResponse<Application>>('/applications/me').then((res) => setApplications(res.data));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[900px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">My Applications</h1>

      {applications === null ? null : applications.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title="No applications yet" description="Browse open roles and apply to get started." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border-soft bg-surface-alt text-left text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                <th className="px-4 py-2.5">Job</th>
                <th className="px-4 py-2.5">Applied</th>
                <th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
