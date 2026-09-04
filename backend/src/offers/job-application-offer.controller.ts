import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { CreateOfferDto } from './dto/create-offer.dto';
import { OffersService } from './offers.service';

// REQ-OFFER-001: HR Manager creates and reviews an offer, nested under
// the application -- same shape as JobApplicationInterviewsController.
@Controller('jobs/:jobId/applications/:id/offer')
export class JobApplicationOfferController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @RequirePermission('offer:create')
  @RequireTenant({ model: 'job', param: 'jobId' })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offersService.create(user.orgId, jobId, applicationId, dto);
  }

  @Get()
  @RequirePermission('offer:read')
  @RequireTenant({ model: 'job', param: 'jobId' })
  getOne(
    @CurrentUser() user: AccessTokenPayload,
    @Param('jobId') jobId: string,
    @Param('id') applicationId: string,
  ) {
    return this.offersService.getForJob(user.orgId, jobId, applicationId);
  }
}
