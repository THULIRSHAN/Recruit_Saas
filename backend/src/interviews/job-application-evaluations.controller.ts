import { Controller, Get, Param } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { InterviewsService } from './interviews.service';

// REQ-EVAL-002: Recruiter/Hiring Manager's aggregate evaluation view for
// decision-making, nested under the application -- same shape as
// JobApplicationInterviewsController.
@Controller('jobs/:jobId/applications/:id/evaluations')
export class JobApplicationEvaluationsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  @RequirePermission('evaluation:read')
  @RequireTenant({ model: 'job', param: 'jobId' })
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
  ) {
    return this.interviewsService.listEvaluationsForApplication(
      user.orgId,
      jobId,
      applicationId,
    );
  }
}
