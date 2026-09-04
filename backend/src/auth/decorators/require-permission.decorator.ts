import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requiredPermission';

// e.g. @RequirePermission('job:create') -- resource:action, per
// docs/authorization.md §2. Must be paired with PermissionsGuard.
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
