import { Controller, Get, Query } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgScoped } from '../auth/decorators/org-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ListOrgOffersQueryDto } from './dto/list-org-offers-query.dto';
import { OffersService } from './offers.service';

// The "all offers I've sent" view -- distinct from the per-application
// offer routes (JobApplicationOfferController/ApplicationOfferController).
// No @RequireTenant() -- there's no :id to check against; the service's
// own requireOrgId() scoping (Offer.organizationId, denormalized) is
// authoritative, same shape as SubscriptionsController's organizations/me
// routes. @OrgScoped() IS required though: offer:read is also granted to
// CANDIDATE (Q26), and PermissionsGuard implicitly adds that role to
// every check unless told this is an org-scoped route -- without it, any
// authenticated org staff member (not just HR Manager/Company Owner)
// would satisfy this check via the implicit CANDIDATE grant. Found via
// this route's own cross-role e2e test, same class of bug as Q23.
@Controller('organizations/me/offers')
export class OrgOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @RequirePermission('offer:read')
  @OrgScoped()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListOrgOffersQueryDto,
  ) {
    return this.offersService.listForOrg(user.orgId, query);
  }
}
