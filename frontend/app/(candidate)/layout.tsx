'use client';

import { AppShell } from '@/components/layout/AppShell';
import { DashboardIcon, GiftIcon, ListIcon, UserIcon } from '@/components/ui';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
  { label: 'My Applications', href: '/dashboard/applications', icon: <ListIcon /> },
  { label: 'Profile', href: '/dashboard/profile', icon: <UserIcon /> },
  { label: 'Offers', href: '/dashboard/offers', icon: <GiftIcon /> },
];

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth((u) => !u.orgId && !u.isSuperAdmin);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>;
  }

  return (
    <AppShell items={NAV_ITEMS} notificationsHref="/dashboard/notifications">
      {children}
    </AppShell>
  );
}
