import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { ApplicationOfferController } from './application-offer.controller';
import { JobApplicationOfferController } from './job-application-offer.controller';
import { OffersService } from './offers.service';
import { OrgOffersController } from './org-offers.controller';

@Module({
  imports: [ApplicationsModule],
  controllers: [
    JobApplicationOfferController,
    ApplicationOfferController,
    OrgOffersController,
  ],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
