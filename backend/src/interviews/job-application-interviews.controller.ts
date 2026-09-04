import { Body, Controller, Param, Post } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { InterviewsService } from './interviews.service';

// REQ-INT-001/002, nested under the application per docs/api.md §1's
// resource-ownership convention -- same shape as
// JobApplicationsController's org-staff routes.
@Controller('jobs/:jobId/applications/:id/interviews')
export class JobApplicationInterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @RequirePermission('interview:schedule')
  @RequireTenant({ model: 'job', param: 'jobId' })
  schedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.interviewsService.schedule(
      user.orgId,
      jobId,
      applicationId,
      dto,
    );
  }

  @Post(':interviewId/reschedule')
  @RequirePermission('interview:schedule')
  @RequireTenant({ model: 'job', param: 'jobId' })
  reschedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
    @Param('interviewId') interviewId: string,
    @Body() dto: RescheduleInterviewDto,
  ) {
    return this.interviewsService.reschedule(
      user.orgId,
      jobId,
      applicationId,
      interviewId,
      dto,
    );
  }
}
