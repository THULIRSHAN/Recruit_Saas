'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, SchoolIcon } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { University } from '@/lib/types';

export default function AdminUniversitiesPage() {
  const [universities, setUniversities] = useState<University[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api.get<University[]>('/universities').then(setUniversities);
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.post('/universities', { name });
      setName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[600px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Universities</h1>

      <Card className="mb-6">
        <form onSubmit={create} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="University name" required />
          <Button type="submit" disabled={creating}>
            {creating ? 'Adding…' : 'Add'}
          </Button>
        </form>
        {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
      </Card>

      {universities === null ? null : universities.length === 0 ? (
        <EmptyState icon={<SchoolIcon />} title="No universities in the catalog yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {universities.map((u) => (
            <Card key={u.id} className="text-[13px] font-semibold text-ink">
              {u.name}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
