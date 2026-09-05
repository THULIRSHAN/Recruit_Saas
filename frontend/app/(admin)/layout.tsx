'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV_ITEMS = [
  { label: 'Overview', href: '/admin' },
  { label: 'Organizations', href: '/admin/organizations' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth((u) => u.isSuperAdmin);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>;
  }

  return <AppShell items={NAV_ITEMS}>{children}</AppShell>;
}
