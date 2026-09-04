import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { AddTaskDto } from './dto/add-task.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { OnboardingService } from './onboarding.service';

// REQ-DOC-001/REQ-ONB-001: HR Manager starts and manages onboarding,
// nested under the application -- same shape as the existing
// interviews/evaluations/offer routes.
@Controller('jobs/:jobId/applications/:id/onboarding')
export class JobApplicationOnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
  @RequirePermission('onboarding:manage')
  @RequireTenant({ model: 'job', param: 'jobId' })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
    @Body() dto: CreateChecklistDto,
  ) {
    return this.onboardingService.createChecklist(
      user.orgId,
      jobId,
      applicationId,
      dto,
    );
  }

  @Get()
  @RequirePermission('onboarding:manage')
  @RequireTenant({ model: 'job', param: 'jobId' })
  getOne(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
  ) {
    return this.onboardingService.getForJob(user.orgId, jobId, applicationId);
  }

  // document:request, not onboarding:manage: REQ-DOC-001 frames adding a
  // task as "requesting a document," a narrower action than managing the
  // checklist as a whole -- both permissions are HR-Manager-only today, so
  // this only matters if a future role gets one without the other.
  @Post('tasks')
  @RequirePermission('document:request')
  @RequireTenant({ model: 'job', param: 'jobId' })
  addTask(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
    @Body() dto: AddTaskDto,
  ) {
    return this.onboardingService.addTask(
      user.orgId,
      jobId,
      applicationId,
      dto,
    );
  }

  @Patch('tasks/:taskId/complete')
  @RequirePermission('onboarding:manage')
  @RequireTenant({ model: 'job', param: 'jobId' })
  completeTask(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.onboardingService.completeTask(
      user.orgId,
      jobId,
      applicationId,
      taskId,
    );
  }
}
