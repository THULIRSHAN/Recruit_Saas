'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, BellIcon, ConfirmDialog } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface AppShellProps {
  items: NavItem[];
  orgLabel?: React.ReactNode;
  notificationsHref?: string;
  children: React.ReactNode;
}

export function AppShell({ items, orgLabel, notificationsHref, children }: AppShellProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="18" height="12" rx="2" />
              <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
              <line x1="3" y1="12.5" x2="21" y2="12.5" />
            </svg>
          </span>
          <span className="font-display text-[15px] font-extrabold text-ink">Hirelane</span>
        </div>
        {orgLabel && (
          <div className="mx-3 mb-2 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-[12.5px] font-bold text-ink">
            {orgLabel}
          </div>
        )}
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-semibold ${
                  active ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-alt'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-border px-4 py-4">
          <Avatar name={user?.fullName ?? user?.email ?? '?'} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-bold text-ink">
              {user?.fullName ?? user?.email}
            </div>
            <button
              type="button"
              onClick={() => setConfirmingLogout(true)}
              className="text-[11.5px] font-semibold text-ink-faint hover:text-danger"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        {notificationsHref && (
          <header className="flex h-[60px] shrink-0 items-center justify-end border-b border-border bg-surface px-6">
            <Link
              href={notificationsHref}
              aria-label="Notifications"
              className={`flex h-9 w-9 items-center justify-center rounded-[9px] ${
                pathname === notificationsHref ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-alt'
              }`}
            >
              <BellIcon size={18} />
            </Link>
          </header>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        description="You'll need to log back in to access your account."
        confirmLabel="Log out"
        variant="danger"
        confirming={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmingLogout(false)}
      />
    </div>
  );
}
