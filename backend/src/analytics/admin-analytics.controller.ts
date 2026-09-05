import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';

// REQ-ANALYTICS-002/Q32: the first controller under the /api/admin/*
// platform-level namespace authorization.md §5 already documents --
// Super Admin only, not tenant-scoped (analytics:platform is already
// seeded, no new permission needed here unlike the org-level side).
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @RequirePermission('analytics:platform')
  getPlatform() {
    return this.analyticsService.getPlatformAnalytics();
  }
}
