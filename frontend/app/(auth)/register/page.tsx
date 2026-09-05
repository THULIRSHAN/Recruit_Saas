'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { dashboardPathFor } from '@/lib/routing';

export default function CandidateSignupPage() {
  const { registerCandidate, login } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await registerCandidate({ fullName, email, password });
      const user = await login(email, password);
      router.push(dashboardPathFor(user));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px]">
      <h1 className="mb-1 text-center text-[20px] font-bold text-ink">Create your account</h1>
      <p className="mb-6 text-center text-[13px] text-ink-soft">
        Find and apply to roles on Hirelane
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Full name">
          <Input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters, with a letter and a number.">
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Button type="submit" size="lg" block disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <div className="mt-5 text-center text-[13px]">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-accent">
          Log in
        </Link>
      </div>
    </Card>
  );
}
