import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ListMyNotificationsQueryDto } from './dto/list-my-notifications-query.dto';
import { NotificationsService } from './notifications.service';

// No @RequirePermission() -- self-scoped data with no elevated
// capability, same reasoning as CandidatesController's GET /me (any
// authenticated user may view/dismiss their own notifications).
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  listMine(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListMyNotificationsQueryDto,
  ) {
    return this.notificationsService.listMine(user.sub, query);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }
}
