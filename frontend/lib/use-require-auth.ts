'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { AuthUser } from './auth-context';
import { useAuth } from './auth-context';

export function useRequireAuth(predicate?: (user: AuthUser) => boolean, redirectTo = '/login') {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user || (predicate && !predicate(user))) {
      // window.location (not useSearchParams) so this hook doesn't force
      // every page using it into a Suspense boundary just to be prerendered.
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const next = encodeURIComponent(`${pathname}${search}`);
      router.replace(`${redirectTo}?next=${next}`);
    }
    // predicate is expected to be referentially stable per call site (an
    // inline arrow is fine -- it's only re-checked when user/loading change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router]);

  return { user, loading };
}
