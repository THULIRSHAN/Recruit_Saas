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
import { RequireTenant } from '../auth/decorators/require-tenant.decorator';
import { AddCandidateDto } from './dto/add-candidate.dto';
import { CreateTalentPoolDto } from './dto/create-talent-pool.dto';
import { TalentPoolsService } from './talent-pools.service';

// REQ-POOL-001. @RequireTenant() on every route naming a specific pool by
// :id, same defense-in-depth pattern as JobsController -- the service
// layer's own organizationId filter (requirePool()) remains the
// authoritative check.
@Controller('talent-pools')
export class TalentPoolsController {
  constructor(private readonly talentPoolsService: TalentPoolsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('talentPool:manage')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateTalentPoolDto,
  ) {
    return this.talentPoolsService.create(user.orgId, dto);
  }

  @Get()
  @RequirePermission('talentPool:manage')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.talentPoolsService.list(user.orgId);
  }

  @Get(':id')
  @RequirePermission('talentPool:manage')
  @RequireTenant({ model: 'talentPool' })
  getOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.talentPoolsService.getOne(user.orgId, id);
  }

  @Post(':id/candidates')
  @RequirePermission('talentPool:manage')
  @RequireTenant({ model: 'talentPool' })
  addCandidate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: AddCandidateDto,
  ) {
    return this.talentPoolsService.addCandidate(user.orgId, id, dto);
  }

  @Delete(':id/candidates/:candidateId')
  @RequirePermission('talentPool:manage')
  @RequireTenant({ model: 'talentPool' })
  removeCandidate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.talentPoolsService.removeCandidate(user.orgId, id, candidateId);
  }
}
