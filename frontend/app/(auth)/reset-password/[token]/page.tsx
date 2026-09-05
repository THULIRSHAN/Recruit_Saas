'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px]">
      <h1 className="mb-1 text-center text-[20px] font-bold text-ink">Reset password</h1>
      {done ? (
        <>
          <p className="mb-6 text-center text-[13px] text-ink-soft">
            Your password has been reset.
          </p>
          <Link href="/login">
            <Button variant="secondary" block>
              Go to log in
            </Button>
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <Field label="New password" hint="At least 8 characters, with a letter and a number.">
            <Input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <Button type="submit" size="lg" block disabled={submitting}>
            {submitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>
      )}
    </Card>
  );
}
