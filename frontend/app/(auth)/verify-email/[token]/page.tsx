'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'checking' | 'verified' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/auth/verify-email`, { token })
      .then(() => setStatus('verified'))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
        setStatus('error');
      });
  }, [token]);

  return (
    <Card className="w-full max-w-[400px] text-center">
      {status === 'checking' && (
        <>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5.5" width="18" height="13" rx="2" />
              <path d="M3.5 6.5 12 13l8.5-6.5" />
            </svg>
          </div>
          <p className="text-[13px] text-ink-soft">Verifying your email…</p>
        </>
      )}
      {status === 'verified' && (
        <>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4.5,12.5 9.5,17.5 19.5,6" />
            </svg>
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-ink">Email verified</h1>
          <p className="mb-5 text-[13px] text-ink-soft">You&rsquo;re all set. You can log in now.</p>
          <Link href="/login">
            <Button block>Go to log in</Button>
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="7" x2="17" y2="17" />
              <line x1="17" y1="7" x2="7" y2="17" />
            </svg>
          </div>
          <h1 className="mb-1 text-[18px] font-bold text-ink">Verification failed</h1>
          <p className="mb-5 text-[13px] text-ink-soft">
            {error ?? 'This link is invalid or has expired.'}
          </p>
          <Link href="/login">
            <Button variant="secondary" block>
              Back to log in
            </Button>
          </Link>
        </>
      )}
    </Card>
  );
}
