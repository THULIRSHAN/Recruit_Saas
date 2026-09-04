import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JobApplicationsController } from './job-applications.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [ApplicationsController, JobApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
