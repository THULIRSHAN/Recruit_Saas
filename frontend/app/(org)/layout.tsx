'use client';

import { AppShell } from '@/components/layout/AppShell';
import {
  BriefcaseIcon,
  CalendarIcon,
  DashboardIcon,
  GearIcon,
  ListIcon,
  OfferIcon,
  SchoolIcon,
  UsersIcon,
} from '@/components/ui';
import { OrgProvider, useOrg } from '@/lib/org-context';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/org', icon: <DashboardIcon /> },
  { label: 'Jobs', href: '/org/jobs', icon: <BriefcaseIcon /> },
  { label: 'Pipeline Templates', href: '/org/pipeline-templates', icon: <ListIcon /> },
  { label: 'Interviews', href: '/org/interviews', icon: <CalendarIcon /> },
  { label: 'Offers', href: '/org/offers', icon: <OfferIcon /> },
  { label: 'Talent Pools', href: '/org/talent-pools', icon: <UsersIcon /> },
  { label: 'University Partners', href: '/org/partnerships', icon: <SchoolIcon /> },
  { label: 'Settings', href: '/org/settings', icon: <GearIcon /> },
];

function OrgLabel() {
  const { organization } = useOrg();
  return <>{organization?.name ?? 'Your organization'}</>;
}

function OrgGate({ children }: { children: React.ReactNode }) {
  const { organization, loading: orgLoading } = useOrg();

  if (orgLoading) {
    return <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>;
  }

  if (organization && organization.status !== 'ACTIVE') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-16 text-center">
        <h1 className="text-[18px] font-bold text-ink">
          {organization.status === 'PENDING_APPROVAL'
            ? 'Your organization is awaiting approval'
            : 'Your organization was not approved'}
        </h1>
        <p className="max-w-sm text-[13px] text-ink-soft">
          {organization.status === 'PENDING_APPROVAL'
            ? "You'll be able to post jobs and manage candidates once a Hirelane admin reviews and approves your organization."
            : 'Contact Hirelane support for more information.'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth((u) => !!u.orgId && !u.isSuperAdmin);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>;
  }

  return (
    <OrgProvider>
      <AppShell items={NAV_ITEMS} orgLabel={<OrgLabel />} notificationsHref="/org/notifications">
        <OrgGate>{children}</OrgGate>
      </AppShell>
    </OrgProvider>
  );
}
