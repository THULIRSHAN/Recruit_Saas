import { Controller, Get, Query } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgScoped } from '../auth/decorators/org-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ApplicationsService } from './applications.service';
import { ListJobApplicationsQueryDto } from './dto/list-job-applications-query.dto';

// The "all applications across every job" view -- distinct from
// JobApplicationsController's per-job routes. No @RequireTenant() -- no :id
// to check against; ApplicationsService's own requireOrgId() scoping
// (Application.organizationId, denormalized) is authoritative, same shape
// as OrgOffersController. @OrgScoped() IS required: application:read is
// also granted to CANDIDATE (Q21), so without it any authenticated user
// would satisfy this check via PermissionsGuard's implicit CANDIDATE grant.
@Controller('organizations/me/applications')
export class OrgApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @RequirePermission('application:read')
  @OrgScoped()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListJobApplicationsQueryDto,
  ) {
    return this.applicationsService.listForOrg(user.orgId, query);
  }
}
