import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgScoped } from '../auth/decorators/org-scoped.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { RejectOrganizationDto } from './dto/reject-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
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

  // No permission gate -- any org-scoped role needs to see this, including
  // the "pending approval" screen (docs/open-questions.md Q15). `orgId`
  // comes only from the caller's own token, so there's no :id to tamper
  // with and thus no cross-tenant surface for this endpoint.
  @Get('me')
  getMine(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.getMine(user.orgId);
  }

  // No permission gate, same reasoning as getMine() -- any org-scoped
  // role may see its own teammates (e.g. to pick an interview panel).
  @Get('me/members')
  listMembers(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listMembers(user.orgId);
  }

  @Patch('me')
  @RequirePermission('organization:update')
  updateMine(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateMine(user.orgId, dto);
  }

  // REQ-AUTH-008: seeded only onto COMPANY_OWNER today (HR Manager can be
  // granted it later per the requirement's "if granted" wording).
  @Post('me/invitations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('user:invite')
  inviteStaff(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.organizationsService.inviteStaff(user.orgId, dto);
  }

  // Q34: same actor as who can send one. @OrgScoped() -- id-less aggregate
  // list, same shape as OrgOffersController (no permission-catalog overlap
  // with CANDIDATE here, but consistent with every other organizations/me/*
  // list route carrying an explicit tenant-scope signal).
  @Get('me/invitations')
  @RequirePermission('user:invite')
  @OrgScoped()
  listPendingInvitations(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listPendingInvitations(user.orgId);
  }

  @Delete('me/invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('user:invite')
  @OrgScoped()
  cancelInvitation(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.organizationsService.cancelInvitation(user.orgId, id);
  }

  // Q34: Company-Owner-only (user:remove was seeded but never used since M4).
  @Delete('me/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('user:remove')
  @OrgScoped()
  removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    return this.organizationsService.removeMember(user.orgId, user.sub, userId);
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
