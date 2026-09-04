import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { JobApplicationInterviewsController } from './job-application-interviews.controller';

@Module({
  imports: [ApplicationsModule],
  controllers: [InterviewsController, JobApplicationInterviewsController],
  providers: [InterviewsService],
})
export class InterviewsModule {}
