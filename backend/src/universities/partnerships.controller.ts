import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreatePartnershipDto } from './dto/create-partnership.dto';
import { UniversitiesService } from './universities.service';

// REQ-UNI-001/Q31: Company Owner manages their own org's partnerships,
// same self-scoped shape as /organizations/me/subscription.
@Controller('organizations/me/partnerships')
export class PartnershipsController {
  constructor(private readonly universitiesService: UniversitiesService) {}

  @Get()
  @RequirePermission('university:partner')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.universitiesService.listPartnerships(user.orgId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('university:partner')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreatePartnershipDto,
  ) {
    return this.universitiesService.createPartnership(user.orgId, dto);
  }

  @Delete(':universityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('university:partner')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('universityId') universityId: string,
  ) {
    return this.universitiesService.removePartnership(user.orgId, universityId);
  }
}
