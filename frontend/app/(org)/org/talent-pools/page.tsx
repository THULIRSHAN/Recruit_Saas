'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, UsersIcon } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { TalentPool } from '@/lib/types';

export default function TalentPoolsPage() {
  const [pools, setPools] = useState<TalentPool[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api.get<TalentPool[]>('/talent-pools').then(setPools);
  }

  useEffect(load, []);

  async function createPool(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.post('/talent-pools', { name });
      setName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Talent Pools</h1>

      <Card className="mb-6">
        <form onSubmit={createPool} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New pool name" required />
          <Button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </form>
        {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
      </Card>

      {pools === null ? null : pools.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="No talent pools yet"
          description="Create a pool, then tag candidates into it from an application's detail page."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {pools.map((pool) => (
            <Link key={pool.id} href={`/org/talent-pools/${pool.id}`}>
              <Card className="flex items-center justify-between hover:shadow-card-md">
                <span className="text-[13.5px] font-bold text-ink">{pool.name}</span>
                <span className="text-[12px] text-ink-faint">{pool.candidates.length} candidates</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
