import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { RejectOrganizationDto } from './dto/reject-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // Same rationale as AuthController's register/login -- public signup,
  // tighter-than-default throttling per docs/security.md §7.
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterOrganizationDto) {
    return this.organizationsService.registerOrganization(dto);
  }

  // Super Admin's review queue (REQ-AUTH-003). Platform-level, not
  // tenant-scoped (docs/authorization.md §5) -- no @RequireTenant() here.
  // Gated under organization:approve per docs/open-questions.md Q14 (no
  // dedicated organization:read/list permission is seeded).
  @Get()
  @RequirePermission('organization:approve')
  list(@Query() query: ListOrganizationsQueryDto) {
    return this.organizationsService.list(query);
  }

  // reVerify: true -- docs/authorization.md §4 names organization approval
  // explicitly as an action that must re-check the DB, not the token claim.
  @Post(':id/approve')
  @RequirePermission('organization:approve', { reVerify: true })
  approve(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.approve(id, user.sub);
  }

  @Post(':id/reject')
  @RequirePermission('organization:reject', { reVerify: true })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RejectOrganizationDto,
  ) {
    return this.organizationsService.reject(id, user.sub, dto.reason);
  }
}
