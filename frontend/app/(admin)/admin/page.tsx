'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { AdminOrganization, PaginatedResponse, PlatformAnalytics } from '@/lib/types';

export default function AdminOverviewPage() {
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [pending, setPending] = useState<AdminOrganization[] | null>(null);

  useEffect(() => {
    api.get<PlatformAnalytics>('/admin/analytics').then(setAnalytics);
    api
      .get<PaginatedResponse<AdminOrganization>>('/organizations', {
        status: 'PENDING_APPROVAL',
        pageSize: 5,
      })
      .then((res) => setPending(res.data));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] gap-8 px-10 py-9">
      <div className="flex-1">
        <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Platform Overview</h1>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Organizations" value={analytics?.organizations.total ?? 0} />
          <StatCard label="Active organizations" value={analytics?.organizations.byStatus.ACTIVE ?? 0} />
          <StatCard label="Jobs posted" value={analytics?.jobs.total ?? 0} />
          <StatCard label="Applications" value={analytics?.applications.total ?? 0} />
        </div>
      </div>

      <div className="w-[300px] shrink-0">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink">Awaiting approval</span>
            <Link href="/admin/organizations" className="text-[12px] font-bold text-accent">
              View all
            </Link>
          </div>
          {pending === null ? null : pending.length === 0 ? (
            <EmptyState title="Nothing pending" />
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((org) => (
                <Link key={org.id} href="/admin/organizations" className="rounded-[9px] border border-border p-2.5">
                  <div className="text-[12.5px] font-bold text-ink">{org.name}</div>
                  <div className="text-[11px] text-ink-faint">Submitted {formatDate(org.createdAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
