import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-ink-faint">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16" y1="16" x2="21" y2="21" />
          <line x1="8.5" y1="11" x2="13.5" y2="11" />
        </svg>
      </div>
      <h1 className="font-display text-[22px] font-extrabold text-ink">Page not found</h1>
      <p className="max-w-sm text-[13px] text-ink-soft">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have been moved.
      </p>
      <Link href="/" className="mt-2">
        <Button variant="secondary">Back to Hirelane</Button>
      </Link>
    </div>
  );
}
