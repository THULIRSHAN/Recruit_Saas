'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'My Applications', href: '/dashboard/applications' },
  { label: 'Profile', href: '/dashboard/profile' },
  { label: 'Offers', href: '/dashboard/offers' },
  { label: 'Notifications', href: '/dashboard/notifications' },
];

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth((u) => !u.orgId && !u.isSuperAdmin);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>;
  }

  return <AppShell items={NAV_ITEMS}>{children}</AppShell>;
}
