'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, GiftIcon } from '@/components/ui';
import { api } from '@/lib/api';
import type { Application, PaginatedResponse } from '@/lib/types';

export default function OffersListPage() {
  const [applications, setApplications] = useState<Application[] | null>(null);

  useEffect(() => {
    api.get<PaginatedResponse<Application>>('/applications/me').then((res) =>
      setApplications(res.data.filter((a) => a.status === 'HIRED')),
    );
  }, []);

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Offers</h1>

      {applications === null ? null : applications.length === 0 ? (
        <EmptyState icon={<GiftIcon />} title="No offers yet" description="Offers will appear here once you've reached that stage." />
      ) : (
        <div className="flex flex-col gap-3">
          {applications.map((app) => (
            <Link key={app.id} href={`/dashboard/offers/${app.id}`}>
              <Card className="hover:shadow-card-md">
                <div className="text-[14px] font-bold text-accent">{app.job.title}</div>
                <div className="text-[12.5px] text-ink-soft">{app.job.organization.name}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
