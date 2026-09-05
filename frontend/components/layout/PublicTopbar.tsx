import Link from 'next/link';
import { Button } from '@/components/ui';

export function PublicTopbar() {
  return (
    <header className="flex h-[68px] items-center justify-between border-b border-border bg-surface px-10">
      <div className="flex items-center gap-9">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="18" height="12" rx="2" />
              <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
              <line x1="3" y1="12.5" x2="21" y2="12.5" />
            </svg>
          </span>
          <span className="font-display text-[16.5px] font-extrabold text-ink">Hirelane</span>
        </Link>
        <nav className="flex items-center gap-6.5">
          <Link href="/" className="text-[13.5px] font-bold text-ink">
            Find Jobs
          </Link>
          <Link href="/register/organization" className="text-[13.5px] font-semibold text-ink-soft">
            For Employers
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/login">
          <Button variant="ghost">Log in</Button>
        </Link>
        <Link href="/register/organization">
          <Button variant="primary">Post a Job</Button>
        </Link>
      </div>
    </header>
  );
}
