import { SetMetadata } from '@nestjs/common';

export const REQUIRE_TENANT_KEY = 'requireTenant';

export interface RequireTenantOptions {
  // Prisma client accessor name for the resource, e.g. 'job' for
  // prisma.job.findUnique(...). Must be a model with an organizationId
  // column (see docs/database.md §1).
  model: string;
  // Route param carrying the resource id. Defaults to 'id'.
  param?: string;
}

// e.g. @RequireTenant({ model: 'job' }) on a route with a :id param. Must
// be paired with TenantGuard. Per docs/multi-tenancy.md §3-5: pre-fetches
// the resource's organizationId and 404s (not 403) on a cross-tenant
// mismatch, as a defense-in-depth guard layer -- never a substitute for
// the service layer's own organizationId filter, which is the
// authoritative check.
export const RequireTenant = (options: RequireTenantOptions) =>
  SetMetadata(REQUIRE_TENANT_KEY, options);
