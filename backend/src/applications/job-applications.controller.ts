import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { ApplicationsService } from './applications.service';
import { DecideApplicationDto } from './dto/decide-application.dto';
import { ListJobApplicationsQueryDto } from './dto/list-job-applications-query.dto';
import { ScreenApplicationDto } from './dto/screen-application.dto';

// Org-staff review of a job's applications (REQ-APP-002/003), nested under
// the job per docs/api.md §1's "nested resources for clear ownership"
// convention -- distinct from ApplicationsController's candidate-owned
// `/applications/*` routes, which use a different ownership filter
// (candidateId, not organizationId) for the same path shape.
@Controller('jobs/:jobId/applications')
export class JobApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @RequirePermission('application:read')
  @RequireTenant({ model: 'job', param: 'jobId' })
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Query() query: ListJobApplicationsQueryDto,
  ) {
    return this.applicationsService.listForJob(user.orgId, jobId, query);
  }

  @Get(':id')
  @RequirePermission('application:read')
  @RequireTenant({ model: 'job', param: 'jobId' })
  getOne(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getForJob(user.orgId, jobId, id);
  }

  @Post(':id/screen')
  @RequirePermission('application:screen')
  @RequireTenant({ model: 'job', param: 'jobId' })
  screen(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') id: string,
    @Body() dto: ScreenApplicationDto,
  ) {
    return this.applicationsService.screen(
      user.orgId,
      user.sub,
      jobId,
      id,
      dto,
    );
  }

  @Post(':id/decide')
  @RequirePermission('application:decide')
  @RequireTenant({ model: 'job', param: 'jobId' })
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') id: string,
    @Body() dto: DecideApplicationDto,
  ) {
    return this.applicationsService.decide(
      user.orgId,
      user.sub,
      jobId,
      id,
      dto,
    );
  }
}
