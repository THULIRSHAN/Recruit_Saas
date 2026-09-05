'use client';

import { useRef, useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useOrg } from '@/lib/org-context';

export function GeneralSettings() {
  const { organization } = useOrg();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = inputRef.current?.value.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch('/organizations/me', { name });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-[480px]">
      <h2 className="mb-3 text-[15px] font-bold text-ink">Organization</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Organization name">
          {/* Uncontrolled + remounted via `key` once the org name loads --
              avoids syncing an async context value into local state via an
              effect just to prefill this one field. */}
          <Input key={organization?.name} ref={inputRef} required defaultValue={organization?.name ?? ''} />
        </Field>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        {saved && <p className="text-[12.5px] text-success">Saved.</p>}
        <Button type="submit" size="sm" className="self-start" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </Card>
  );
}
