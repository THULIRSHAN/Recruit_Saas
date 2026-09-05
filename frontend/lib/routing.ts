import type { AuthUser } from './auth-context';

export function dashboardPathFor(user: AuthUser): string {
  if (user.isSuperAdmin) return '/admin';
  if (user.orgId) return '/org';
  return '/dashboard';
}
