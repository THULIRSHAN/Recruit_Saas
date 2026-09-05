'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Card,
  CheckIcon,
  ClockIcon,
  EmptyState,
  OfferIcon,
  StatCard,
  XCircleIcon,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { OfferStatus, OrgOffer, PaginatedResponse } from '@/lib/types';

const STATUS_BADGE: Record<OfferStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  SENT: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'neutral',
};

const STATUS_LABEL: Record<OfferStatus, string> = {
  SENT: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};

const TABS: { key: 'ALL' | OfferStatus; label: string }[] = [
  { key: 'ALL', label: 'All Offers' },
  { key: 'SENT', label: 'Pending' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'DECLINED', label: 'Declined' },
];

export default function OrgOffersPage() {
  const [offers, setOffers] = useState<OrgOffer[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('ALL');

  useEffect(() => {
    api
      .get<PaginatedResponse<OrgOffer>>('/organizations/me/offers', { pageSize: 100 })
      .then((res) => setOffers(res.data));
  }, []);

  const counts = useMemo(() => {
    const list = offers ?? [];
    return {
      total: list.length,
      pending: list.filter((o) => o.status === 'SENT').length,
      accepted: list.filter((o) => o.status === 'ACCEPTED').length,
      declinedOrExpired: list.filter((o) => o.status === 'DECLINED' || o.status === 'EXPIRED').length,
    };
  }, [offers]);

  const visible = useMemo(() => {
    const list = offers ?? [];
    return tab === 'ALL' ? list : list.filter((o) => o.status === tab);
  }, [offers, tab]);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-10 py-9">
      <div className="mb-6">
        <h1 className="font-display text-[24px] font-extrabold text-ink">Offers</h1>
        <p className="mt-1 text-[13px] text-ink-soft">Track every offer sent from your organization</p>
      </div>

      {offers === null ? null : offers.length === 0 ? (
        <EmptyState icon={<OfferIcon />} title="No offers sent yet" description="Offers you send to candidates will show up here." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            <StatCard label="Total offers" value={counts.total} icon={<OfferIcon />} tone="accent" />
            <StatCard label="Pending response" value={counts.pending} icon={<ClockIcon />} tone="warning" />
            <StatCard label="Accepted" value={counts.accepted} icon={<CheckIcon size={16} />} tone="success" />
            <StatCard label="Declined / Expired" value={counts.declinedOrExpired} icon={<XCircleIcon />} tone="danger" />
          </div>

          <Card padded={false} className="overflow-hidden">
            <div className="flex gap-6 border-b border-border px-5 pt-4">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`border-b-2 pb-3 text-[13.5px] font-bold ${
                    tab === t.key ? 'border-accent text-ink' : 'border-transparent text-ink-faint'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="p-10 text-center text-[13px] text-ink-soft">No offers in this view.</div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border-soft text-left text-[10.5px] font-bold tracking-wide text-ink-faint uppercase">
                    <th className="px-4 py-2.5">Candidate</th>
                    <th className="px-4 py-2.5">Job</th>
                    <th className="px-4 py-2.5">Compensation</th>
                    <th className="px-4 py-2.5">Sent</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((offer) => (
                    <tr key={offer.id} className="border-b border-border-soft last:border-0 hover:bg-surface-alt">
                      <td className="px-4 py-3">
                        <Link
                          href={`/org/jobs/${offer.job.id}/applications/${offer.applicationId}`}
                          className="flex items-center gap-2.5 font-bold text-ink"
                        >
                          <Avatar name={offer.candidate.fullName} size={28} />
                          {offer.candidate.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{offer.job.title}</td>
                      <td className="px-4 py-3 text-ink-soft">{offer.compensation ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-faint">{formatDate(offer.sentAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[offer.status]}>{STATUS_LABEL[offer.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/org/jobs/${offer.job.id}/applications/${offer.applicationId}`} className="font-bold text-accent">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
