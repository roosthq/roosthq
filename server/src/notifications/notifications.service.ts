import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationType, Prisma } from '@prisma/client';
import { PushService, type PushSubscriptionInput } from './push.service';
import { EmailService } from './email.service';
import { emailHtml, escapeHtml } from './email-template';
import { paginate } from '../common/pagination';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

export type NotifyChannel = 'inapp' | 'push' | 'email';
const ALL_CHANNELS: NotifyChannel[] = ['inapp', 'push', 'email'];

// The only notifyAdults()/notifyFamily() types that are actually ABOUT one
// identifiable kid - the rest either go straight to the person they're
// about (CHORE_APPROVED, AWARD_GRANTED, ...) rather than to observing
// adults, or (the weekly digest) name several kids in one message with no
// single subject. These are the types the adult-preferences UI shows a per-
// kid picker for; see notifyAdults's subjectUserId param.
export const KID_SCOPED_TYPES: NotificationType[] = ['CHORE_PENDING', 'PRIZE_SUGGESTED', 'REDEMPTION_REQUESTED', 'GAME_PRIZE_WON', 'CHORE_EXCUSED'];
// Other notifyAdults()/notifyFamily() types an adult can still mute/redirect,
// just without a kid dimension - no single subject to key off of.
export const GLOBAL_ADULT_TYPES: NotificationType[] = ['CALENDAR_EVENT_ADDED', 'CALENDAR_EVENT_REMINDER', 'MEMBER_JOINED', 'STREAK_BONUS'];

export interface NotifyPrefs {
  kid?: Record<string, Partial<Record<NotificationType, NotifyChannel[]>>>;
  global?: Partial<Record<NotificationType, NotifyChannel[]>>;
}

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
  // `channels` is only passed by deliverToAdult below, once it's resolved
  // that adult's own preferences - every other call site (a notification
  // going straight to the person it's actually about) keeps the old
  // unconditional default: in-app + push always, email opt-in only.
  async create(
    familyId: string,
    userId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string; refId?: string; channels?: NotifyChannel[] } = {},
  ) {
    const channels = opts.channels ?? ALL_CHANNELS;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (channels.includes('inapp')) {
      try {
        await this.prisma.notification.create({
          data: { familyId, userId, type, title, body: opts.body, link: opts.link, refId: opts.refId },
        });
      } catch {
        // Notifications are a convenience, not core to the action that
        // triggered them - a failure here shouldn't roll back or fail the
        // caller's request.
        return;
      }
    }

    if (channels.includes('push')) {
      await this.push.notify(userId, { title, body: opts.body, link: opts.link }).catch(() => undefined);
    }

    const wantsEmail = opts.channels ? channels.includes('email') : user?.notifyByEmail;
    if (wantsEmail && user?.email) {
      await this.email.send(
        user.email,
        title,
        opts.body ?? title,
        emailHtml({
          webUrl: WEB_URL,
          heading: title,
          bodyHtml: opts.body ? `<p style="margin:0;">${escapeHtml(opts.body)}</p>` : '',
          buttonText: opts.link ? 'Open Roost HQ' : undefined,
          buttonUrl: opts.link ? `${WEB_URL}${opts.link}` : undefined,
        }),
      );
    }
  }

  // An adult's effective channel set for one notification `type`, optionally
  // about `subjectUserId` (a kid). Explicit override (kid-specific, then
  // global) wins; with no override at all, falls back to the pre-preferences
  // default (in-app + push always, email only if notifyByEmail) so nobody's
  // notifications silently change just because this feature shipped.
  private effectiveChannels(
    adult: { notifyPrefs: unknown; notifyByEmail: boolean },
    type: NotificationType,
    subjectUserId?: string,
  ): NotifyChannel[] {
    const prefs = (adult.notifyPrefs as NotifyPrefs) ?? {};
    const fallback: NotifyChannel[] = adult.notifyByEmail ? ALL_CHANNELS : ['inapp', 'push'];
    if (subjectUserId && KID_SCOPED_TYPES.includes(type)) {
      const kidOverride = prefs.kid?.[subjectUserId]?.[type];
      if (kidOverride) return kidOverride;
    }
    const globalOverride = prefs.global?.[type];
    if (globalOverride) return globalOverride;
    return fallback;
  }

  // notifyAdults/notifyFamily's per-adult-recipient send: resolves that
  // adult's own preferences before handing off to create().
  private async deliverToAdult(
    familyId: string,
    adultUserId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string; refId?: string },
    subjectUserId?: string,
  ) {
    const adult = await this.prisma.user.findUnique({
      where: { id: adultUserId },
      select: { notifyPrefs: true, notifyByEmail: true },
    });
    if (!adult) return;
    const channels = this.effectiveChannels(adult, type, subjectUserId);
    if (channels.length === 0) return; // fully muted - don't even touch the DB
    await this.create(familyId, adultUserId, type, title, { ...opts, channels });
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
    // subjectUserId: the one kid this is ABOUT (their chore, their
    // redemption, ...) - only meaningful for KID_SCOPED_TYPES; every other
    // type ignores it and just checks each adult's global preference.
    opts: { body?: string; link?: string; refId?: string; excludeUserId?: string; subjectUserId?: string } = {},
  ) {
    const adults = await this.prisma.user.findMany({
      where: {
        familyId,
        role: { in: ['OWNER', 'FAMILY_MANAGER', 'ADULT'] },
        ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    await Promise.all(adults.map((a) => this.deliverToAdult(familyId, a.id, type, title, opts, opts.subjectUserId)));
  }

  // Same shape as notifyAdults but every role - kids included. Currently
  // just the "someone new joined" announcement (AuthService), which is
  // exactly the kind of thing a kid would want to know about too.
  async notifyFamily(
    familyId: string,
    type: NotificationType,
    title: string,
    opts: { body?: string; link?: string; refId?: string; excludeUserId?: string } = {},
  ) {
    const members = await this.prisma.user.findMany({
      where: { familyId, ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}) },
      select: { id: true, role: true },
    });
    // Adults get their own preference check same as notifyAdults; kids have
    // no preferences to check (this feature is adult-only) so they keep the
    // unconditional default.
    await Promise.all(
      members.map((m) =>
        this.isAdult(m.role) ? this.deliverToAdult(familyId, m.id, type, title, opts) : this.create(familyId, m.id, type, title, opts),
      ),
    );
  }

  // ---- Adult notification preferences ----

  private assertAdult(role?: string) {
    if (!this.isAdult(role)) throw new ForbiddenException('Adults only');
  }

  async getPrefs(actingUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    if (!user) throw new ForbiddenException('Adults only');
    this.assertAdult(user.role);
    return {
      prefs: (user.notifyPrefs as NotifyPrefs) ?? {},
      notifyByEmail: user.notifyByEmail,
      kidScopedTypes: KID_SCOPED_TYPES,
      globalTypes: GLOBAL_ADULT_TYPES,
    };
  }

  async setPrefs(actingUserId: string, prefs: NotifyPrefs) {
    const user = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    if (!user) throw new ForbiddenException('Adults only');
    this.assertAdult(user.role);

    // Validate shape server-side rather than trusting the client blob
    // wholesale - bad keys here would silently swallow real notifications.
    const validTypes = new Set([...KID_SCOPED_TYPES, ...GLOBAL_ADULT_TYPES]);
    const cleanChannels = (v: unknown): NotifyChannel[] | undefined => {
      if (!Array.isArray(v)) return undefined;
      const c = v.filter((x): x is NotifyChannel => ALL_CHANNELS.includes(x));
      return c;
    };
    const clean: NotifyPrefs = {};
    if (prefs.global) {
      clean.global = {};
      for (const [type, channels] of Object.entries(prefs.global)) {
        if (!validTypes.has(type as NotificationType)) continue;
        const c = cleanChannels(channels);
        if (c) clean.global[type as NotificationType] = c;
      }
    }
    if (prefs.kid) {
      const kidIds = new Set((await this.prisma.user.findMany({ where: { familyId: user.familyId, role: 'KID' }, select: { id: true } })).map((k) => k.id));
      clean.kid = {};
      for (const [kidId, byType] of Object.entries(prefs.kid)) {
        if (!kidIds.has(kidId) || !byType) continue;
        const entry: Partial<Record<NotificationType, NotifyChannel[]>> = {};
        for (const [type, channels] of Object.entries(byType)) {
          if (!KID_SCOPED_TYPES.includes(type as NotificationType)) continue;
          const c = cleanChannels(channels);
          if (c) entry[type as NotificationType] = c;
        }
        if (Object.keys(entry).length) clean.kid[kidId] = entry;
      }
    }

    await this.prisma.user.update({ where: { id: actingUserId }, data: { notifyPrefs: clean as Prisma.InputJsonValue } });
    return { prefs: clean };
  }

  // Mine (default), or - adults only - the whole family's activity.
  async list(familyId: string, actingUserId: string, opts: { all?: boolean; skip?: number; take?: number } = {}) {
    const skip = opts.skip ?? 0;
    const take = opts.take ?? 50;
    if (opts.all) {
      const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actor || !this.isAdult(actor.role)) throw new ForbiddenException('Adults only');
      const rows = await this.prisma.notification.findMany({
        where: { familyId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: take + 1,
        include: { user: { select: { id: true, displayName: true } } },
      });
      return paginate(rows, take);
    }
    const rows = await this.prisma.notification.findMany({
      where: { familyId, userId: actingUserId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
    });
    return paginate(rows, take);
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
