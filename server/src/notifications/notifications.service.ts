import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  private isAdult(role?: string) {
    return role === 'OWNER' || role === 'ADULT';
  }

  // Called by other services when something notification-worthy happens.
  // Fire-and-forget from the caller's perspective — never throws upward.
  async create(
    familyId: string,
    userId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string } = {},
  ) {
    try {
      await this.prisma.notification.create({
        data: { familyId, userId, type, title, body: opts.body, link: opts.link },
      });
    } catch {
      // Notifications are a convenience, not core to the action that triggered
      // them — a failure here shouldn't roll back or fail the caller's request.
    }
  }

  async notifyAdults(
    familyId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string; excludeUserId?: string } = {},
  ) {
    const adults = await this.prisma.user.findMany({
      where: {
        familyId,
        role: { in: ['OWNER', 'ADULT'] },
        ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    await Promise.all(adults.map((a) => this.create(familyId, a.id, type, title, opts)));
  }

  // Mine (default), or — adults only — the whole family's activity.
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
