'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

interface Organization {
  id: string;
  name: string;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED';
}

const OrgContext = createContext<{ organization: Organization | null; loading: boolean } | null>(
  null,
);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Organization>('/organizations/me')
      .then(setOrganization)
      .finally(() => setLoading(false));
  }, []);

  return (
    <OrgContext.Provider value={{ organization, loading }}>{children}</OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within an OrgProvider');
  return ctx;
}
