import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  // ?all=1 -> family-wide activity feed (adults only, enforced in the service).
  @Get()
  list(@CurrentUser() u: SessionPayload, @Query('all') all?: string) {
    return this.notifications.list(u.familyId, u.userId, { all: all === '1' || all === 'true' });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() u: SessionPayload) {
    return this.notifications.unreadCount(u.userId).then((count) => ({ count }));
  }

  @Post(':id/read')
  markRead(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.notifications.markRead(u.userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() u: SessionPayload) {
    return this.notifications.markAllRead(u.userId);
  }
}
