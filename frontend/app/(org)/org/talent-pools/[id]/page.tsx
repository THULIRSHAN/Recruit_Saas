'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Card, EmptyState, UsersIcon } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { TalentPool } from '@/lib/types';

export default function TalentPoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pool, setPool] = useState<TalentPool | null>(null);

  function load() {
    api.get<TalentPool>(`/talent-pools/${id}`).then(setPool);
  }

  useEffect(load, [id]);

  async function removeCandidate(candidateId: string) {
    await api.delete(`/talent-pools/${id}/candidates/${candidateId}`);
    load();
  }

  if (!pool) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <button onClick={() => router.push('/org/talent-pools')} className="mb-4 text-[13px] font-semibold text-ink-soft">
        ← Back to talent pools
      </button>
      <h1 className="mb-6 font-display text-[22px] font-extrabold text-ink">{pool.name}</h1>

      {pool.candidates.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="No candidates tagged yet"
          description="Tag a candidate into this pool from their application detail page."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {pool.candidates.map((candidate) => (
            <Card key={candidate.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={candidate.fullName ?? '?'} size={34} />
                <div>
                  <div className="text-[13px] font-bold text-ink">{candidate.fullName ?? 'Unknown'}</div>
                  <div className="text-[12px] text-ink-faint">{candidate.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11.5px] text-ink-faint">Added {formatDate(candidate.addedAt)}</span>
                <button onClick={() => removeCandidate(candidate.id)} className="text-[11.5px] font-bold text-danger">
                  Remove
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
