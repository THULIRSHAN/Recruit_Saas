import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { OffersModule } from '../offers/offers.module';
import { StorageModule } from '../storage/storage.module';
import { ApplicationOnboardingController } from './application-onboarding.controller';
import { JobApplicationOnboardingController } from './job-application-onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [ApplicationsModule, OffersModule, StorageModule],
  controllers: [
    JobApplicationOnboardingController,
    ApplicationOnboardingController,
  ],
  providers: [OnboardingService],
})
export class OnboardingModule {}
