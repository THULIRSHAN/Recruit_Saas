import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { ApplicationOfferController } from './application-offer.controller';
import { JobApplicationOfferController } from './job-application-offer.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [ApplicationsModule],
  controllers: [JobApplicationOfferController, ApplicationOfferController],
  providers: [OffersService],
})
export class OffersModule {}
