import { Controller, Get } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';

// REQ-ANALYTICS-001/Q32: org-scoped, same self-scoped shape as
// /organizations/me/subscription.
@Controller('organizations/me/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @RequirePermission('analytics:read')
  getMine(@CurrentUser() user: AccessTokenPayload) {
    return this.analyticsService.getOrgAnalytics(user.orgId);
  }
}
