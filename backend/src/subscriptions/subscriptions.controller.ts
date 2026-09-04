import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SelectPlanDto } from './dto/select-plan.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // REQ-SUB-001: a public pricing catalog, same reasoning as public job
  // search -- no tenant data is exposed.
  @Public()
  @Get('plans')
  listPlans() {
    return this.subscriptionsService.listPlans();
  }

  @Get('organizations/me/subscription')
  @RequirePermission('subscription:manage')
  getMine(@CurrentUser() user: AccessTokenPayload) {
    return this.subscriptionsService.getMine(user.orgId);
  }

  @Post('organizations/me/subscription')
  @RequirePermission('subscription:manage')
  selectPlan(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SelectPlanDto,
  ) {
    return this.subscriptionsService.selectPlan(user.orgId, dto);
  }
}
