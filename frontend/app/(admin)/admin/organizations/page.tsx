'use client';

import { useEffect, useState } from 'react';
import { Badge, BuildingIcon, Button, Card, EmptyState, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { AdminOrganization, OrganizationStatus, PaginatedResponse } from '@/lib/types';

const TABS: { key: OrganizationStatus; label: string }[] = [
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'REJECTED', label: 'Rejected' },
];

export default function AdminOrganizationsPage() {
  const [tab, setTab] = useState<OrganizationStatus>('PENDING_APPROVAL');
  const [orgs, setOrgs] = useState<AdminOrganization[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  function load() {
    api
      .get<PaginatedResponse<AdminOrganization>>('/organizations', { status: tab, pageSize: 50 })
      .then((res) => {
        setOrgs(res.data);
        setSelectedId(res.data.length > 0 ? res.data[0].id : null);
      });
  }

  // Switching tabs leaves the previous tab's list on screen until the new
  // one loads (briefly stale, never empty) -- avoids an eager setState
  // directly in the effect body just to clear it first.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const selected = orgs?.find((o) => o.id === selectedId) ?? null;

  async function approve(id: string) {
    setActing(true);
    setError(null);
    try {
      await api.post(`/organizations/${id}/approve`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setActing(false);
    }
  }

  async function reject(id: string) {
    setActing(true);
    setError(null);
    try {
      if (!reason.trim()) throw new Error('A rejection reason is required.');
      await api.post(`/organizations/${id}/reject`, { reason });
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Organizations</h1>

      <div className="mb-5 flex gap-2 border-b border-border-soft">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-[13px] font-semibold ${
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {orgs === null ? null : orgs.length === 0 ? (
        <EmptyState icon={<BuildingIcon />} title={`No ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} organizations`} />
      ) : (
        <div className="flex gap-6">
          <div className="flex w-[320px] shrink-0 flex-col gap-2">
            {orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => setSelectedId(org.id)}
                className={`rounded-lg border p-3 text-left ${
                  selectedId === org.id ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                }`}
              >
                <div className="text-[13px] font-bold text-ink">{org.name}</div>
                <div className="text-[11.5px] text-ink-faint">Submitted {formatDate(org.createdAt)}</div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex-1">
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[16px] font-bold text-ink">{selected.name}</h2>
                  <Badge variant={selected.status === 'ACTIVE' ? 'success' : selected.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {selected.status}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Submitted</span>
                    <span className="font-semibold text-ink">{formatDate(selected.createdAt)}</span>
                  </div>
                  {selected.approvedAt && (
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Approved</span>
                      <span className="font-semibold text-ink">{formatDate(selected.approvedAt)}</span>
                    </div>
                  )}
                  {selected.rejectedReason && (
                    <div className="flex justify-between gap-4">
                      <span className="shrink-0 text-ink-soft">Rejection reason</span>
                      <span className="text-right font-semibold text-ink">{selected.rejectedReason}</span>
                    </div>
                  )}
                </div>

                {error && <p className="mt-4 text-[12.5px] text-danger">{error}</p>}

                {selected.status === 'PENDING_APPROVAL' && (
                  <div className="mt-5 flex flex-col gap-3">
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Rejection reason (required to reject)"
                      rows={3}
                    />
                    <div className="flex gap-3">
                      <Button variant="success" disabled={acting} onClick={() => approve(selected.id)}>
                        Approve
                      </Button>
                      <Button variant="danger" disabled={acting} onClick={() => reject(selected.id)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
