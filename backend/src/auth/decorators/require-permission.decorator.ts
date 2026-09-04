import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  permission: string;
  // docs/authorization.md §4 "Trust boundary note": for irreversible or
  // sensitive actions (organization approval, role changes, payment
  // operations, offer sending) the guard must re-verify the role against
  // the database instead of trusting the (up to ~15min stale) token claim.
  reVerify?: boolean;
}

// e.g. @RequirePermission('job:create') -- resource:action, per
// docs/authorization.md §2. Must be paired with PermissionsGuard.
export const RequirePermission = (
  permission: string,
  options?: { reVerify?: boolean },
) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, {
    permission,
    reVerify: options?.reVerify ?? false,
  } satisfies RequiredPermission);
