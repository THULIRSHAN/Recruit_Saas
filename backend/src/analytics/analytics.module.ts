import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
