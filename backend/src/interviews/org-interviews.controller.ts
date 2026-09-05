import { Controller, Get, Query } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgScoped } from '../auth/decorators/org-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ListMyInterviewsQueryDto } from './dto/list-my-interviews-query.dto';
import { InterviewsService } from './interviews.service';

// The "upcoming across the org" view -- distinct from InterviewsController's
// per-interviewer /interviews/me. No @RequireTenant() -- no :id to check
// against; InterviewsService's own requireOrgId() scoping
// (Interview.organizationId, denormalized) is authoritative, same shape as
// OrgOffersController/OrgApplicationsController.
@Controller('organizations/me/interviews')
export class OrgInterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  @RequirePermission('interview:read')
  @OrgScoped()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListMyInterviewsQueryDto,
  ) {
    return this.interviewsService.listUpcomingForOrg(user.orgId, query);
  }
}
