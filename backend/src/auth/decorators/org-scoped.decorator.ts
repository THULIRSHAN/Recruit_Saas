import { SetMetadata } from '@nestjs/common';

export const ORG_SCOPED_KEY = 'orgScoped';

// For a route scoped to the caller's own organization via their token's
// orgId, with no :id param for @RequireTenant()/TenantGuard to check
// (e.g. GET /organizations/me/offers, an aggregate list, not a single
// resource by id).
//
// PermissionsGuard implicitly adds the CANDIDATE role to every permission
// check unless the route also carries @RequireTenant() (see its comment
// for the full reasoning) -- that exclusion exists so a permission key
// shared between a candidate's self-scoped grant and org staff's
// org-scoped grant (e.g. offer:read: candidates hold it for their own
// GET /applications/:id/offer, HR Manager holds it for the org-wide list)
// can't be satisfied by just any org staff member's implicit CANDIDATE
// grant. @RequireTenant() can't be reused here since there's no resource
// id to look up; this decorator carries the same PermissionsGuard signal
// without requiring one.
export const OrgScoped = () => SetMetadata(ORG_SCOPED_KEY, true);
