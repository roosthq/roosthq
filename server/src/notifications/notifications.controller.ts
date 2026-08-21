import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { NotificationsService, type NotifyPrefs } from './notifications.service';
import type { PushSubscriptionInput } from './push.service';
import { parsePageParams } from '../common/pagination';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  // Public VAPID key the client needs to call pushManager.subscribe(). Not
  // secret, but still gated behind auth like everything else here.
  @Get('push/public-key')
  pushPublicKey() {
    return { key: this.notifications.pushPublicKey };
  }

  @Post('push/subscribe')
  subscribePush(@CurrentUser() u: SessionPayload, @Body() body: PushSubscriptionInput) {
    return this.notifications.subscribePush(u.userId, body);
  }

  @Delete('push/subscribe')
  unsubscribePush(@CurrentUser() u: SessionPayload, @Body() body: { endpoint: string }) {
    return this.notifications.unsubscribePush(u.userId, body.endpoint);
  }

  // ?all=1 -> family-wide activity feed (adults only, enforced in the service).
  @Get()
  list(@CurrentUser() u: SessionPayload, @Query('all') all?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    const p = parsePageParams(skip, take);
    return this.notifications.list(u.familyId, u.userId, { all: all === '1' || all === 'true', skip: p.skip, take: p.take });
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

  // Adults-only (enforced in the service): which channel(s) they get each
  // notification type on, and per-kid overrides for the types that are
  // about one specific kid.
  @Get('prefs')
  getPrefs(@CurrentUser() u: SessionPayload) {
    return this.notifications.getPrefs(u.userId);
  }

  @Post('prefs')
  setPrefs(@CurrentUser() u: SessionPayload, @Body() body: { prefs: NotifyPrefs }) {
    return this.notifications.setPrefs(u.userId, body.prefs ?? {});
  }
}
