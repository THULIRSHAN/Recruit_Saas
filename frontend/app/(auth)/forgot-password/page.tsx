'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px]">
      <h1 className="mb-1 text-center text-[20px] font-bold text-ink">Forgot password</h1>
      <p className="mb-6 text-center text-[13px] text-ink-soft">
        We&rsquo;ll send a reset link if that email is registered.
      </p>
      {message ? (
        <p className="text-center text-[13px] text-ink-soft">{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <Button type="submit" size="lg" block disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <div className="mt-5 text-center text-[13px]">
        <Link href="/login" className="font-semibold text-accent">
          Back to log in
        </Link>
      </div>
    </Card>
  );
}
