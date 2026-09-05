'use client';

import { AppShell } from '@/components/layout/AppShell';
import { BuildingIcon, DashboardIcon, SchoolIcon } from '@/components/ui';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV_ITEMS = [
  { label: 'Overview', href: '/admin', icon: <DashboardIcon /> },
  { label: 'Organizations', href: '/admin/organizations', icon: <BuildingIcon /> },
  { label: 'Universities', href: '/admin/universities', icon: <SchoolIcon /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth((u) => u.isSuperAdmin);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>;
  }

  return (
    <AppShell items={NAV_ITEMS} notificationsHref="/admin/notifications">
      {children}
    </AppShell>
  );
}
