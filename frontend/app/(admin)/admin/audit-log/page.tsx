'use client';

import { useEffect, useState } from 'react';
import { Card, ChevronLeftIcon, ChevronRightIcon, ClipboardIcon, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry, PaginatedResponse } from '@/lib/types';

const PAGE_SIZE = 20;

export default function AdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedResponse<AuditLogEntry> | null>(null);

  useEffect(() => {
    api
      .get<PaginatedResponse<AuditLogEntry>>('/admin/audit-log', { page, pageSize: PAGE_SIZE })
      .then(setResult);
  }, [page]);

  const entries = result?.data ?? [];
  const total = result?.meta.total ?? 0;
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-10 py-9">
      <div className="mb-6">
        <h1 className="font-display text-[24px] font-extrabold text-ink">Audit Log</h1>
        <p className="mt-1 text-[13px] text-ink-soft">Every action taken across the platform</p>
      </div>

      {result === null ? null : entries.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          title="No activity yet"
          description="Platform events like organization approvals will show up here."
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border-soft text-left text-[10.5px] font-bold tracking-wide text-ink-faint uppercase">
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Target</th>
                <th className="px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-3 font-bold text-ink">{entry.actor?.fullName ?? 'System'}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-surface-alt px-2 py-1 text-[12px]">{entry.action}</code>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {entry.organization?.name ?? `${entry.targetType} ${entry.targetId}`}
                  </td>
                  <td className="px-4 py-3 text-ink-faint">{formatDateTime(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3.5 text-[12.5px] text-ink-faint">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + entries.length} of {total} events
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-soft disabled:opacity-40"
              >
                <ChevronLeftIcon />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-soft disabled:opacity-40"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
