'use client';

import { useState } from 'react';
import { BillingSettings } from '@/components/org/BillingSettings';
import { GeneralSettings } from '@/components/org/GeneralSettings';
import { TeamSettings } from '@/components/org/TeamSettings';

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'team', label: 'Team' },
  { key: 'billing', label: 'Billing' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function OrgSettingsPage() {
  const [tab, setTab] = useState<TabKey>('general');

  return (
    <div className="mx-auto w-full max-w-[800px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Organization Settings</h1>

      <div className="mb-6 flex gap-2 border-b border-border-soft">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-[13px] font-semibold ${
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralSettings />}
      {tab === 'team' && <TeamSettings />}
      {tab === 'billing' && <BillingSettings />}
    </div>
  );
}
