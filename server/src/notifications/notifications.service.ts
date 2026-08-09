import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationType } from '@prisma/client';
import { PushService, type PushSubscriptionInput } from './push.service';
import { EmailService } from './email.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private email: EmailService,
  ) {}

  private isAdult(role?: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  // Called by other services when something notification-worthy happens.
  // Fire-and-forget from the caller's perspective - never throws upward.
  // Writes the in-app feed entry, then best-effort fans out to push/email.
  async create(
    familyId: string,
    userId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string; refId?: string } = {},
  ) {
    try {
      await this.prisma.notification.create({
        data: { familyId, userId, type, title, body: opts.body, link: opts.link, refId: opts.refId },
      });
    } catch {
      // Notifications are a convenience, not core to the action that triggered
      // them - a failure here shouldn't roll back or fail the caller's request.
      return;
    }

    await this.push.notify(userId, { title, body: opts.body, link: opts.link }).catch(() => undefined);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.notifyByEmail && user.email) {
      await this.email.send(user.email, title, opts.body ?? title);
    }
  }

  // Called from delete paths: when the thing a notification points at is gone,
  // the notification goes with it. Silent no-op when nothing matches.
  async removeByRef(refId: string | string[]) {
    const ids = (Array.isArray(refId) ? refId : [refId]).filter(Boolean);
    if (ids.length === 0) return { removed: 0 };
    const r = await this.prisma.notification
      .deleteMany({ where: { refId: { in: ids } } })
      .catch(() => ({ count: 0 }));
    return { removed: r.count };
  }

  get pushPublicKey(): string | null {
    return this.push.publicKey;
  }

  async subscribePush(userId: string, sub: PushSubscriptionInput) {
    return this.push.subscribe(userId, sub);
  }

  async unsubscribePush(userId: string, endpoint: string) {
    return this.push.unsubscribe(userId, endpoint);
  }

  async notifyAdults(
    familyId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string; refId?: string; excludeUserId?: string } = {},
  ) {
    const adults = await this.prisma.user.findMany({
      where: {
        familyId,
        role: { in: ['OWNER', 'FAMILY_MANAGER', 'ADULT'] },
        ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    await Promise.all(adults.map((a) => this.create(familyId, a.id, type, title, opts)));
  }

  // Mine (default), or - adults only - the whole family's activity.
  async list(familyId: string, actingUserId: string, opts: { all?: boolean } = {}) {
    if (opts.all) {
      const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actor || !this.isAdult(actor.role)) throw new ForbiddenException('Adults only');
      return this.prisma.notification.findMany({
        where: { familyId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { user: { select: { id: true, displayName: true } } },
      });
    }
    return this.prisma.notification.findMany({
      where: { familyId, userId: actingUserId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async unreadCount(actingUserId: string) {
    return this.prisma.notification.count({ where: { userId: actingUserId, readAt: null } });
  }

  async markRead(actingUserId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: actingUserId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(actingUserId: string) {
    await this.prisma.notification.updateMany({
      where: { userId: actingUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
