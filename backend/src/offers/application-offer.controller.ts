import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RespondOfferDto } from './dto/respond-offer.dto';
import { OffersService } from './offers.service';

// REQ-OFFER-002: candidate-owned, no @RequireTenant() -- ownership is by
// candidateId (via ApplicationsService.getMine()), same shape as
// ApplicationsController's /applications/:id.
@Controller('applications/:id/offer')
export class ApplicationOfferController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @RequirePermission('offer:read')
  getMine(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') applicationId: string,
  ) {
    return this.offersService.getMine(user.sub, applicationId);
  }

  @Post('respond')
  @RequirePermission('offer:respond')
  respond(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') applicationId: string,
    @Body() dto: RespondOfferDto,
  ) {
    return this.offersService.respond(user.sub, applicationId, dto);
  }
}
