'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { dashboardPathFor } from '@/lib/routing';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      router.push(next ? decodeURIComponent(next) : dashboardPathFor(user));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px]">
      <h1 className="mb-1 text-center text-[20px] font-bold text-ink">Log in</h1>
      <p className="mb-6 text-center text-[13px] text-ink-soft">
        Welcome back to Hirelane
      </p>
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
        <Field label="Password">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Button type="submit" size="lg" block disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="mt-5 flex flex-col items-center gap-2 text-[13px]">
        <Link href="/register" className="font-semibold text-accent">
          Create a candidate account
        </Link>
        <Link href="/register/organization" className="font-semibold text-accent">
          Register your organization
        </Link>
      </div>
    </Card>
  );
}
