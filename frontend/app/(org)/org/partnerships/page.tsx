'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, SchoolIcon, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { University, UniversityPartnership } from '@/lib/types';

export default function PartnershipsPage() {
  const [partnerships, setPartnerships] = useState<UniversityPartnership[] | null>(null);
  const [universities, setUniversities] = useState<University[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api.get<UniversityPartnership[]>('/organizations/me/partnerships').then(setPartnerships);
    api.get<University[]>('/universities').then(setUniversities);
  }

  useEffect(load, []);

  async function addPartnership(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAdding(true);
    setError(null);
    try {
      await api.post('/organizations/me/partnerships', { universityId: selected });
      setSelected('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setAdding(false);
    }
  }

  async function remove(universityId: string) {
    await api.delete(`/organizations/me/partnerships/${universityId}`);
    load();
  }

  const partneredIds = new Set(partnerships?.map((p) => p.university.id));
  const available = universities.filter((u) => !partneredIds.has(u.id));

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">University Partners</h1>

      <Card className="mb-6">
        <form onSubmit={addPartnership} className="flex gap-2">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a university…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={!selected || adding}>
            {adding ? 'Adding…' : 'Partner'}
          </Button>
        </form>
        {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
      </Card>

      {partnerships === null ? null : partnerships.length === 0 ? (
        <EmptyState icon={<SchoolIcon />} title="No partnerships yet" description="Partner with a university to source candidates." />
      ) : (
        <div className="flex flex-col gap-2">
          {partnerships.map((p) => (
            <Card key={p.id} className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-ink">{p.university.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11.5px] text-ink-faint">Since {formatDate(p.startedAt)}</span>
                <button onClick={() => remove(p.university.id)} className="text-[11.5px] font-bold text-danger">
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
