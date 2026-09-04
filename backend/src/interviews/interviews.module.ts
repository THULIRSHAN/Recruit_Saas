import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { JobApplicationEvaluationsController } from './job-application-evaluations.controller';
import { JobApplicationInterviewsController } from './job-application-interviews.controller';

@Module({
  imports: [ApplicationsModule, NotificationsModule],
  controllers: [
    InterviewsController,
    JobApplicationInterviewsController,
    JobApplicationEvaluationsController,
  ],
  providers: [InterviewsService],
})
export class InterviewsModule {}
