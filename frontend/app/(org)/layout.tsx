'use client';

import { AppShell } from '@/components/layout/AppShell';
import { OrgProvider, useOrg } from '@/lib/org-context';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/org' },
  { label: 'Jobs', href: '/org/jobs' },
  { label: 'Interviews', href: '/org/interviews' },
  { label: 'Talent Pools', href: '/org/talent-pools' },
  { label: 'University Partners', href: '/org/partnerships' },
  { label: 'Subscription', href: '/org/subscription' },
  { label: 'Notifications', href: '/org/notifications' },
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
      <AppShell items={NAV_ITEMS} orgLabel={<OrgLabel />}>
        <OrgGate>{children}</OrgGate>
      </AppShell>
    </OrgProvider>
  );
}
