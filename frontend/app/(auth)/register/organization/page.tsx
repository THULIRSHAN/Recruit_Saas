'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Divider, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

const STEPS = [
  { label: 'Submit your organization', done: true },
  { label: 'Platform review', current: true },
  { label: 'Approval email', done: false },
  { label: 'Start hiring', done: false },
];

export default function OrganizationSignupPage() {
  const [organizationName, setOrganizationName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/organizations', {
        organizationName,
        ownerFullName,
        ownerEmail,
        ownerPassword,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full max-w-[560px] gap-6">
      <Card className="flex-1">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
              ✓
            </div>
            <h1 className="text-[18px] font-bold text-ink">Organization submitted</h1>
            <p className="text-[13px] text-ink-soft">
              We&rsquo;ll review <strong>{organizationName}</strong> and email{' '}
              {ownerEmail} once it&rsquo;s approved.
            </p>
            <Link href="/login" className="mt-2">
              <Button variant="secondary">Go to log in</Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-[20px] font-bold text-ink">Register your organization</h1>
            <p className="mb-6 text-[13px] text-ink-soft">
              Start posting jobs and managing candidates on Hirelane
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field label="Organization name">
                <Input
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Acme Studio"
                />
              </Field>
              <Divider />
              <div className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                Your account
              </div>
              <Field label="Full name">
                <Input
                  required
                  value={ownerFullName}
                  onChange={(e) => setOwnerFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Work email">
                <Input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </Field>
              <Field label="Password" hint="At least 8 characters, with a letter and a number.">
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              {error && <p className="text-[12.5px] text-danger">{error}</p>}
              <Button type="submit" size="lg" block disabled={submitting}>
                {submitting ? 'Creating organization…' : 'Create organization'}
              </Button>
            </form>
            <div className="mt-5 text-center text-[13px]">
              Already registered?{' '}
              <Link href="/login" className="font-semibold text-accent">
                Log in
              </Link>
            </div>
          </>
        )}
      </Card>

      <Card className="flex w-[220px] flex-col gap-4 border-dashed">
        <div className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          What happens next
        </div>
        <div className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    step.done
                      ? 'bg-success text-white'
                      : step.current
                        ? 'bg-accent text-white'
                        : 'bg-surface-alt text-ink-faint'
                  }`}
                >
                  {step.done ? '✓' : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className="mt-1 h-6 w-px bg-border" />}
              </div>
              <span
                className={`text-[12.5px] ${step.current ? 'font-bold text-ink' : 'text-ink-soft'}`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-faint">
          Organizations are reviewed before they can post jobs or receive applications.
        </p>
      </Card>
    </div>
  );
}
