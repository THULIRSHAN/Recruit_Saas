import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { OrganizationsService } from './organizations.service';

// Separate from OrganizationsController (/organizations) because the
// invitee accepting a token has no "own org" context yet -- this isn't a
// nested organizations/me route.
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // Same rationale as AuthController's register/login -- public,
  // account-creating endpoint, tighter-than-default throttling per
  // docs/security.md §7.
  @Public()
  @Post(':token/accept')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.organizationsService.acceptInvitation(token, dto);
  }
}
