'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

interface AcceptedInvitation {
  email: string;
  role: { key: string; name: string };
}

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<AcceptedInvitation>(`/invitations/${token}/accept`, {
        fullName: fullName || undefined,
        password: password || undefined,
      });
      setAccepted(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[420px]">
      {accepted ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-[20px] text-success">
            ✓
          </div>
          <h1 className="text-[18px] font-bold text-ink">You&rsquo;re in</h1>
          <p className="text-[13px] text-ink-soft">
            You&rsquo;ve joined as {accepted.role.name}. Log in with {accepted.email} to get started.
          </p>
          <Link href="/login" className="mt-2">
            <Button variant="secondary">Go to log in</Button>
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mb-1 text-center text-[20px] font-bold text-ink">Accept invitation</h1>
          <p className="mb-6 text-center text-[13px] text-ink-soft">
            If this is your first time on Hirelane, set a name and password below. If you already
            have an account, leave these blank.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Full name (new accounts only)">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Password (new accounts only)" hint="At least 8 characters, with a letter and a number.">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <Button type="submit" size="lg" block disabled={submitting}>
              {submitting ? 'Accepting…' : 'Accept invitation'}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
