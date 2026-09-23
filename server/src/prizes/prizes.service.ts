import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { assertKidPermission } from '../common/kid-permissions';
import { assertFeatureEnabled, isFeatureEnabled } from '../common/features';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate } from '../common/pagination';
import { DisplayEventsService } from '../display/display-events.service';
import { PresenceService } from '../presence/presence.service';
import { DEFAULT_TIMEZONE, todayKeyInZone, dowOfKey, addDaysToKey, addMonthsToKey, startOfDayInZone } from '../common/timezone';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrizeInput {
  name: string;
  description?: string;
  image?: string;
  imageCrop?: CropRect | null;
  url?: string;
  realPrice?: number;
  tokenCost: number;
  type?: 'ITEM' | 'EVENT' | 'PASS';
  scope?: 'GLOBAL' | 'SPECIFIC';
  assignedUserIds?: string[];
  locationId?: string | null;
  repeatable?: boolean;
  archived?: boolean;
  suggested?: boolean;
  // 'STORE' (default) or 'AWARD_ONLY' - see schema.prisma's Prize.visibility.
  visibility?: 'STORE' | 'AWARD_ONLY';
  // Not PASS-exclusive (see schema.prisma's own comment) but that's the type
  // it's really for - false skips the pending queue entirely, straight to
  // FULFILLED at redeem() time.
  requiresApproval?: boolean;
  // PASS type only - see schema.prisma for the full contract.
  passUnitKind?: 'TIME' | 'COUNT' | null;
  passUnitMinutes?: number | null;
  passUnitLabel?: string | null;
  passUnitLabelPlural?: string | null;
  passDailyLimit?: number | null;
  passWeeklyLimit?: number | null;
  passMonthlyLimit?: number | null;
  // int[], 0=Sun..6=Sat - weekdays this pass can't be bought on. null/empty = no restriction.
  passBlockedDaysOfWeek?: number[] | null;
}

export interface PrizeSuggestionInput {
  name: string;
  description?: string;
  image?: string;
  url?: string;
}

@Injectable()
export class PrizesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
    private presence: PresenceService,
  ) {}

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !this.isAdult(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  private async owned(familyId: string, id: string) {
    const p = await this.prisma.prize.findFirst({ where: { id, familyId } });
    if (!p) throw new NotFoundException('Prize not found');
    return p;
  }

  private async balance(userId: string) {
    const a = await this.prisma.tokenLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return a._sum.delta ?? 0;
  }

  // Start-of-window instants for "how many has this kid already redeemed of
  // this PASS today/this week/this month" - day is a calendar day, week is
  // Monday-start (matches weekRangeInZone's own convention elsewhere in the
  // app), month is calendar month, all in DEFAULT_TIMEZONE (no per-family
  // timezone field exists yet - same convention learning.service.ts uses).
  private passWindowStarts(): { day: Date; week: Date; month: Date } {
    const today = todayKeyInZone(DEFAULT_TIMEZONE);
    const monday = addDaysToKey(today, -((dowOfKey(today) + 6) % 7));
    const firstOfMonth = { y: today.y, m: today.m, d: 1 };
    return {
      day: startOfDayInZone(today, DEFAULT_TIMEZONE),
      week: startOfDayInZone(monday, DEFAULT_TIMEZONE),
      month: startOfDayInZone(firstOfMonth, DEFAULT_TIMEZONE),
    };
  }

  // Sum of quantity this user has redeemed of this prize since each window
  // started - REJECTED doesn't count (the request never actually happened),
  // everything else (requested/approved/fulfilled) does, same as the token
  // balance already being spent while a request sits pending.
  private async passUsage(prizeId: string, userId: string): Promise<{ day: number; week: number; month: number }> {
    const starts = this.passWindowStarts();
    const rows = await this.prisma.redemption.findMany({
      where: { prizeId, userId, requestedAt: { gte: starts.month }, status: { not: 'REJECTED' } },
      select: { requestedAt: true, quantity: true },
    });
    let day = 0;
    let week = 0;
    let month = 0;
    for (const r of rows) {
      month += r.quantity;
      if (r.requestedAt >= starts.week) week += r.quantity;
      if (r.requestedAt >= starts.day) day += r.quantity;
    }
    return { day, week, month };
  }

  // How many more of this PASS this kid can redeem RIGHT NOW, the tightest
  // of whichever of day/week/month limits are actually set - null means no
  // limit applies at all (unlimited). Used both to cap the kid-facing
  // quantity stepper (list()) and to enforce the real limit server-side
  // (redeem()), so the two can never disagree.
  private async remainingPassQuantity(
    prize: { id: string; passDailyLimit: number | null; passWeeklyLimit: number | null; passMonthlyLimit: number | null },
    userId: string,
  ): Promise<number | null> {
    if (prize.passDailyLimit == null && prize.passWeeklyLimit == null && prize.passMonthlyLimit == null) return null;
    const usage = await this.passUsage(prize.id, userId);
    const remaining = [
      prize.passDailyLimit != null ? prize.passDailyLimit - usage.day : Infinity,
      prize.passWeeklyLimit != null ? prize.passWeeklyLimit - usage.week : Infinity,
      prize.passMonthlyLimit != null ? prize.passMonthlyLimit - usage.month : Infinity,
    ];
    return Math.max(0, Math.min(...remaining));
  }

  // Non-adult visibility: global + assigned scope, not archived, not an
  // unapproved suggestion (unless it's their own), and - for a located prize -
  // only if the person belongs to that location, UNLESS the prize is assigned
  // to them directly (that overrides the location gate).
  private visibleTo(
    p: {
      scope: string;
      archived: boolean;
      suggested: boolean;
      suggestedById: string | null;
      locationId: string | null;
      visibility: string;
      assignments: { userId: string }[];
    },
    actingUserId: string,
    myLocationIds: Set<string>,
  ): boolean {
    // Award-only: never in the kid-facing list, no matter what else would
    // otherwise make it visible - the whole point is it stays a surprise.
    if (p.visibility === 'AWARD_ONLY') return false;
    if (p.archived) return false;
    if (p.suggested && p.suggestedById !== actingUserId) return false;
    const assignedToMe = p.assignments.some((a) => a.userId === actingUserId);
    if (p.scope !== 'GLOBAL' && !assignedToMe) return false;
    if (p.locationId && !assignedToMe && !myLocationIds.has(p.locationId)) return false;
    return true;
  }

  // Owner/family manager see everything (incl. real price, archived prizes,
  // all suggestions, every household's location-scoped prizes) - they manage
  // the whole family, not just one house. A plain adult manages same as a
  // kid sees location-wise (family-wide, or their own house's) but keeps the
  // adult-only extras (real price, archived, every suggestion) within that
  // scope - same "isTopManager sees everything, plain adult is location-
  // scoped" split ChoresService.list() already uses. Kids see only what
  // visibleTo() allows, no real price.
  async list(familyId: string, actingUserId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'store'))) return [];
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId }, include: { locations: true } });
    const adult = !!actor && this.isAdult(actor.role);
    const isTopManager = actor?.role === 'OWNER' || actor?.role === 'FAMILY_MANAGER';
    const myLocationIds = new Set((actor?.locations ?? []).map((l) => l.locationId));
    const prizes = await this.prisma.prize.findMany({
      where: { familyId },
      include: {
        assignments: true,
        location: true,
        creator: { select: { id: true, displayName: true } },
        suggestedBy: { select: { id: true, displayName: true } },
      },
    });
    const visible = prizes.filter((p) => {
      if (isTopManager) return true;
      if (adult) return !p.locationId || myLocationIds.has(p.locationId) || p.assignments.some((a) => a.userId === actingUserId);
      return this.visibleTo(p, actingUserId, myLocationIds);
    });
    // Only kids need "how many can I still buy right now" (adults are
    // managing the prize, not spending against their own limit) - and only
    // for PASS prizes that actually have a limit set, so this stays a
    // no-op query-wise for every other prize in the list.
    const remainingByPrizeId = new Map<string, number | null>();
    if (!adult) {
      for (const p of visible) {
        if (p.type === 'PASS' && (p.passDailyLimit != null || p.passWeeklyLimit != null || p.passMonthlyLimit != null)) {
          remainingByPrizeId.set(p.id, await this.remainingPassQuantity(p, actingUserId));
        }
      }
    }
    // Same "today's weekday, once, not per-prize" computation redeem() does -
    // cheap enough to just call for every request, no caching needed.
    const todayDow = dowOfKey(todayKeyInZone(DEFAULT_TIMEZONE));
    return visible.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      image: p.image,
      imageCrop: p.imageCrop as CropRect | null,
      url: adult ? p.url : undefined,
      realPrice: adult ? p.realPrice : undefined, // hidden from kids
      tokenCost: p.tokenCost,
      type: p.type,
      scope: p.scope,
      visibility: p.visibility,
      assignedUserIds: p.assignments.map((a) => a.userId),
      location: p.location ? { id: p.location.id, name: p.location.name } : null,
      repeatable: p.repeatable,
      archived: p.archived,
      createdByName: p.creator?.displayName ?? null,
      suggested: p.suggested,
      suggestedById: p.suggestedById,
      suggestedByName: p.suggestedBy?.displayName ?? null,
      requiresApproval: p.requiresApproval,
      passUnitKind: p.passUnitKind,
      passUnitMinutes: p.passUnitMinutes,
      passUnitLabel: p.passUnitLabel,
      passUnitLabelPlural: p.passUnitLabelPlural,
      passDailyLimit: p.passDailyLimit,
      passWeeklyLimit: p.passWeeklyLimit,
      passMonthlyLimit: p.passMonthlyLimit,
      passBlockedDaysOfWeek: p.passBlockedDaysOfWeek as number[] | null,
      remainingNow: remainingByPrizeId.get(p.id),
      blockedToday: p.type === 'PASS' && Array.isArray(p.passBlockedDaysOfWeek) && (p.passBlockedDaysOfWeek as number[]).includes(todayDow),
    }));
  }

  // PASS is inherently repeatable (a one-off "pass" makes no sense with a
  // quantity/limit model) and the pass* fields are meaningless noise on any
  // other type - keep them null there rather than carrying stale values
  // around if a prize's type ever changes.
  private normalizePassFields(type: 'ITEM' | 'EVENT' | 'PASS', dto: Partial<PrizeInput>) {
    if (type !== 'PASS') {
      return {
        repeatable: dto.repeatable ?? true,
        passUnitKind: null,
        passUnitMinutes: null,
        passUnitLabel: null,
        passUnitLabelPlural: null,
        passDailyLimit: null,
        passWeeklyLimit: null,
        passMonthlyLimit: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's Json field type fights a plain nullable array here, same as imageCrop above
        passBlockedDaysOfWeek: null as any,
      };
    }
    return {
      repeatable: true,
      passUnitKind: dto.passUnitKind ?? null,
      passUnitMinutes: dto.passUnitKind === 'TIME' ? (dto.passUnitMinutes ?? null) : null,
      passUnitLabel: dto.passUnitKind === 'COUNT' ? (dto.passUnitLabel?.trim() || null) : null,
      passUnitLabelPlural: dto.passUnitKind === 'COUNT' ? (dto.passUnitLabelPlural?.trim() || null) : null,
      passDailyLimit: dto.passDailyLimit ?? null,
      passWeeklyLimit: dto.passWeeklyLimit ?? null,
      passMonthlyLimit: dto.passMonthlyLimit ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's Json field type fights a plain nullable array here, same as imageCrop above
      passBlockedDaysOfWeek: (dto.passBlockedDaysOfWeek?.length ? dto.passBlockedDaysOfWeek : null) as any,
    };
  }

  async create(familyId: string, actorId: string, dto: PrizeInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'store');
    await this.assertAdult(actorId);
    const type = dto.type ?? 'ITEM';
    const prize = await this.prisma.prize.create({
      data: {
        familyId,
        name: dto.name,
        description: dto.description,
        image: dto.image,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's Json field type fights a plain nullable interface here
        imageCrop: (dto.imageCrop ?? undefined) as any,
        url: dto.url,
        realPrice: dto.realPrice ?? null,
        tokenCost: dto.tokenCost ?? 0,
        type,
        scope: dto.scope ?? 'GLOBAL',
        visibility: dto.visibility ?? 'STORE',
        locationId: dto.locationId ?? null,
        requiresApproval: dto.requiresApproval ?? true,
        ...this.normalizePassFields(type, dto),
        createdById: actorId,
        assignments:
          dto.scope === 'SPECIFIC' && dto.assignedUserIds?.length
            ? { create: dto.assignedUserIds.map((userId) => ({ userId })) }
            : undefined,
      },
    });
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return prize;
  }

  // A kid submits a wishlist item - created with no cost (an adult sets that
  // on approval), defaulted to "for me" so it stays private until approved.
  async suggest(familyId: string, userId: string, dto: PrizeSuggestionInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'store');
    const prize = await this.prisma.prize.create({
      data: {
        familyId,
        name: dto.name,
        description: dto.description,
        image: dto.image,
        url: dto.url,
        tokenCost: 0,
        scope: 'SPECIFIC',
        suggested: true,
        suggestedById: userId,
        assignments: { create: [{ userId }] },
      },
    });
    const requester = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.notifications.notifyAdults(familyId, 'PRIZE_SUGGESTED', `${requester?.displayName ?? 'A kid'} wants "${dto.name}" added to the store`, {
      link: `/store?tab=prizes&suggestionId=${prize.id}`,
      refId: prize.id,
      subjectUserId: userId,
    });
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return prize;
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<PrizeInput>) {
    await this.assertAdult(actorId);
    const existing = await this.owned(familyId, id);
    const resultingType = dto.type ?? (existing.type as 'ITEM' | 'EVENT' | 'PASS');
    // Only re-derive the pass/repeatable fields when the caller actually
    // touched something that'd change them - a plain field edit (e.g. just
    // the description) shouldn't silently reset an untouched prize's limits
    // back to null every time it's saved.
    const touchesPassFields = dto.type !== undefined || dto.repeatable !== undefined || Object.keys(dto).some((k) => k.startsWith('pass'));
    await this.prisma.prize.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.image !== undefined && { image: dto.image }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's Json field type fights a plain nullable interface here
        ...(dto.imageCrop !== undefined && { imageCrop: dto.imageCrop as any }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.realPrice !== undefined && { realPrice: dto.realPrice }),
        ...(dto.tokenCost !== undefined && { tokenCost: dto.tokenCost }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.scope !== undefined && { scope: dto.scope }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.archived !== undefined && { archived: dto.archived }),
        ...(dto.suggested !== undefined && { suggested: dto.suggested }),
        ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
        ...(touchesPassFields ? this.normalizePassFields(resultingType, dto) : {}),
      },
    });
    if (dto.assignedUserIds) {
      await this.prisma.prizeAssignment.deleteMany({ where: { prizeId: id } });
      if (dto.scope === 'SPECIFIC' && dto.assignedUserIds.length) {
        await this.prisma.prizeAssignment.createMany({
          data: dto.assignedUserIds.map((userId) => ({ prizeId: id, userId })),
        });
      }
    }
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return this.prisma.prize.findUnique({
      where: { id },
      include: { assignments: true, location: true, creator: { select: { id: true, displayName: true } } },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    // Redemptions cascade with the prize; their notifications don't.
    const redemptions = await this.prisma.redemption.findMany({ where: { prizeId: id }, select: { id: true } });
    await this.prisma.prize.delete({ where: { id } });
    await this.notifications.removeByRef([id, ...redemptions.map((r) => r.id)]);
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return { ok: true };
  }

  // Renders a PASS's quantity as a human phrase - "a 30 minute pass" (TIME,
  // qty 1), "a 1 hour pass" (TIME, qty 2 @ 30 min/unit), "3 cookies" (COUNT).
  // Same formatting the client shows before purchase - kept here too so
  // ledger reasons/notifications read the same way, not just the UI.
  static formatPassQuantity(
    prize: { passUnitKind: string | null; passUnitMinutes: number | null; passUnitLabel: string | null; passUnitLabelPlural: string | null },
    quantity: number,
  ): string {
    if (prize.passUnitKind === 'TIME' && prize.passUnitMinutes) {
      const totalMin = prize.passUnitMinutes * quantity;
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      const phrase = hrs === 0 ? `${mins} minute` : mins === 0 ? `${hrs} hour${hrs > 1 ? 's' : ''}` : `${hrs} hr ${mins} min`;
      return `a ${phrase} pass`;
    }
    if (prize.passUnitKind === 'COUNT' && prize.passUnitLabel) {
      const noun = quantity === 1 ? prize.passUnitLabel : prize.passUnitLabelPlural || `${prize.passUnitLabel}s`;
      return `${quantity} ${noun}`;
    }
    return `x${quantity}`;
  }

  // Redeem: check eligibility + balance + (PASS) day/week/month limits,
  // deduct tokens (ledger), record the purchase, and - for a non-repeatable
  // prize - archive it so it drops out of the active store once bought.
  // `quantity` is PASS-only; forced to 1 for every other type regardless of
  // what's passed, so a stray/hostile value there can't do anything.
  async redeem(familyId: string, actingUserId: string, prizeId: string, requestedQuantity = 1) {
    await assertFeatureEnabled(this.prisma, familyId, 'store');
    await assertKidPermission(this.prisma, actingUserId, 'store');
    // Away/vacation blocks buying prizes outright - checked on their
    // CURRENT status, same whether it's their own session, ghosted, or kiosk.
    await this.presence.assertActionable(actingUserId);
    const prize = await this.prisma.prize.findFirst({
      where: { id: prizeId, familyId },
      include: { assignments: true },
    });
    if (!prize) throw new NotFoundException('Prize not found');
    if (prize.suggested) throw new BadRequestException('This is still a pending suggestion, not in the store yet');

    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId }, include: { locations: true } });
    if (!actor) throw new ForbiddenException();
    if (!this.isAdult(actor.role)) {
      const myLocationIds = new Set(actor.locations.map((l) => l.locationId));
      if (!this.visibleTo(prize, actingUserId, myLocationIds)) {
        throw new ForbiddenException('Not available to you');
      }
    } else if (prize.archived) {
      throw new BadRequestException('This prize is no longer available');
    }

    const quantity = prize.type === 'PASS' ? Math.max(1, Math.floor(requestedQuantity) || 1) : 1;
    if (prize.type === 'PASS') {
      const blockedDays = prize.passBlockedDaysOfWeek as number[] | null;
      if (Array.isArray(blockedDays) && blockedDays.length) {
        const todayDow = dowOfKey(todayKeyInZone(DEFAULT_TIMEZONE));
        if (blockedDays.includes(todayDow)) {
          throw new BadRequestException("This pass can't be bought today");
        }
      }
      const remaining = await this.remainingPassQuantity(prize, actingUserId);
      if (remaining != null && quantity > remaining) {
        throw new BadRequestException(remaining === 0 ? "You've hit the limit for this today" : `Only ${remaining} left of this for now`);
      }
    }

    const totalCost = prize.tokenCost * quantity;
    const bal = await this.balance(actingUserId);
    if (bal < totalCost) throw new BadRequestException('Not enough tokens');

    // A PASS that doesn't require approval resolves itself right here -
    // there's no adult action left to take, so it never enters the pending
    // queue at all (see setRedemptionStatus/StorePage's own "Grant" button).
    const autoApprove = !prize.requiresApproval;
    const redemption = await this.prisma.redemption.create({
      data: { prizeId, userId: actingUserId, quantity, status: autoApprove ? 'FULFILLED' : 'REQUESTED' },
    });
    const label = prize.type === 'PASS' ? ` (${PrizesService.formatPassQuantity(prize, quantity)})` : '';
    await this.prisma.tokenLedger.create({
      data: {
        userId: actingUserId,
        delta: -totalCost,
        reason: `Redeemed: ${prize.name}${label}`,
        type: 'REDEEM',
        refId: redemption.id,
        createdById: actingUserId,
      },
    });
    if (!prize.repeatable) {
      await this.prisma.prize.update({ where: { id: prizeId }, data: { archived: true } });
    }
    if (autoApprove) {
      // Adults still get told (visibility, not a to-do) - the kid doesn't
      // need a notification about something they just did themselves.
      await this.notifications.notifyAdults(
        familyId,
        'REDEMPTION_FULFILLED',
        `${actor.displayName} used ${PrizesService.formatPassQuantity(prize, quantity)} of "${prize.name}"`,
        { link: `/store?tab=prizes&redemptionId=${redemption.id}`, excludeUserId: actingUserId, refId: redemption.id, subjectUserId: actingUserId },
      );
    } else {
      await this.notifications.notifyAdults(familyId, 'REDEMPTION_REQUESTED', `${actor.displayName} wants "${prize.name}"${label}`, {
        link: `/store?tab=prizes&redemptionId=${redemption.id}`,
        excludeUserId: actingUserId,
        refId: redemption.id,
        subjectUserId: actingUserId,
      });
    }
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return redemption;
  }

  // Adult fulfills or rejects a purchase; rejection refunds the tokens.
  async setRedemptionStatus(
    familyId: string,
    actorId: string,
    redemptionId: string,
    status: 'FULFILLED' | 'REJECTED',
  ) {
    await this.assertAdult(actorId);
    const r = await this.prisma.redemption.findUnique({
      where: { id: redemptionId },
      include: { prize: true },
    });
    if (!r || r.prize.familyId !== familyId) throw new NotFoundException('Redemption not found');
    // Already-resolved guard: this used to have no status check at all, so
    // a second adult acting on a stale notification/pending-list snapshot
    // (someone else already fulfilled or rejected it) could double-refund
    // tokens (rejecting an already-fulfilled one) or grant a prize a second
    // time for free (fulfilling an already-rejected/refunded one), and
    // either way silently overwrite the first adult's decision. Once
    // resolved either way, later calls are a no-op - same "already done,
    // just return it" pattern chores.service.ts's finalizeApproval uses.
    if (r.status === 'FULFILLED' || r.status === 'REJECTED') return r;
    if (status === 'REJECTED') {
      await this.prisma.tokenLedger.create({
        data: {
          userId: r.userId,
          // r.quantity - PASS redemptions can be >1; refunding just
          // tokenCost would shortchange anything bought more than one at a
          // time (ITEM/EVENT are always quantity 1, so unaffected).
          delta: r.prize.tokenCost * r.quantity,
          reason: `Refund: ${r.prize.name}`,
          type: 'REDEEM',
          refId: r.id,
          createdById: actorId,
        },
      });
      // The sale didn't go through - put a one-off prize back in the store.
      if (!r.prize.repeatable && r.prize.archived) {
        await this.prisma.prize.update({ where: { id: r.prizeId }, data: { archived: false } });
      }
    }
    const updated = await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status, approvedBy: actorId },
    });
    // "Fulfilled" is the right word for a physical handoff (ITEM) or an
    // outing (EVENT) - wrong for a PASS, which isn't a thing to go get
    // ready, it's a permission being granted. Same distinction the
    // pending-queue button makes (StorePage's "Grant" vs "Fulfilled").
    const isPass = r.prize.type === 'PASS';
    await this.notifications.create(
      familyId,
      r.userId,
      status === 'FULFILLED' ? 'REDEMPTION_FULFILLED' : 'REDEMPTION_REJECTED',
      status === 'FULFILLED'
        ? isPass
          ? `"${r.prize.name}" granted!`
          : `"${r.prize.name}" is ready!`
        : `"${r.prize.name}" was declined - tokens refunded`,
      { link: '/store', refId: r.id },
    );
    // The "wants this" ask has been answered - drop it from the adults' feed
    // so the inbox doesn't keep nagging about a settled request.
    await this.notifications.removeByRef(r.id);
    this.displayEvents.publish(familyId, { type: status === 'REJECTED' ? 'tokens' : 'prizes' });
    return updated;
  }

  // EVENT prizes only: mark whether the actual event has happened yet -
  // separate from FULFILLED, which just means the redemption was approved.
  async setRedemptionUsed(familyId: string, actorId: string, redemptionId: string, used: boolean) {
    await this.assertAdult(actorId);
    const r = await this.prisma.redemption.findUnique({ where: { id: redemptionId }, include: { prize: true } });
    if (!r || r.prize.familyId !== familyId) throw new NotFoundException('Redemption not found');
    const updated = await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { usedAt: used ? new Date() : null },
    });
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return updated;
  }

  // Purchase history: a member's own, the whole family, or (adults only) one
  // prize's full buyer history - surfaced in that prize's detail view.
  async redemptions(familyId: string, actingUserId: string, opts: { userId?: string; prizeId?: string; skip?: number; take?: number } = {}) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'store'))) return { items: [], hasMore: false };
    if (opts.prizeId) await this.assertAdult(actingUserId);
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    const isAdult = !!actor && this.isAdult(actor.role);
    const take = opts.take ?? 50;
    const redemptions = await this.prisma.redemption.findMany({
      where: {
        prize: { familyId },
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.prizeId ? { prizeId: opts.prizeId } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      skip: opts.skip ?? 0,
      take: take + 1,
      include: {
        prize: {
          select: {
            name: true,
            tokenCost: true,
            type: true,
            passUnitKind: true,
            passUnitMinutes: true,
            passUnitLabel: true,
            passUnitLabelPlural: true,
          },
        },
        user: { select: { id: true, displayName: true } },
        approvedByUser: { select: { id: true, displayName: true } },
      },
    });
    const { items, hasMore } = paginate(redemptions, take);
    const ids = items.map((r) => r.id);
    // Redisplays every historical amount below at TODAY's token scale
    // instead of whatever raw number was actually stored - see
    // PLANNING.md §17. A no-op (equals the stored delta exactly) unless the
    // family has ever rescaled.
    const family = await this.prisma.family.findUnique({ where: { id: familyId }, select: { tokenValueUsd: true } });
    const currentTokenValueUsd = family?.tokenValueUsd || 1;
    // Co-view charges (see chargeCoViewer) for whichever of these redemptions
    // have any - fetched in one batch and grouped, not per-row, so a long
    // history list doesn't fan out into N extra queries.
    const coViewCharges = ids.length
      ? await this.prisma.tokenLedger.findMany({
          where: { type: 'CO_VIEW', refId: { in: ids } },
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const coViewersByRedemption = new Map<string, { id: string; userId: string; displayName: string; tokens: number }[]>();
    for (const c of coViewCharges) {
      const list = coViewersByRedemption.get(c.refId!) ?? [];
      list.push({ id: c.id, userId: c.userId, displayName: c.user.displayName, tokens: Math.round(-c.dollarEquivalent / currentTokenValueUsd) });
      coViewersByRedemption.set(c.refId!, list);
    }
    // What was actually paid, from the REDEEM ledger entry itself - not
    // r.prize.tokenCost, which is the prize's CURRENT price and silently
    // drifts if it's changed since. The ledger entry created in redeem() is
    // the real historical record; only the negative (spend) entry counts, so
    // a later refund's positive entry (same refId) doesn't cancel it out
    // here - a rejected/refunded redemption should still show what it
    // originally cost. A #5 reward-game win (source: 'GAME') never went
    // through redeem() at all, so it has no REDEEM entry - correctly falls
    // back to 0 (nothing was spent; it was won).
    const redeemCharges = ids.length
      ? await this.prisma.tokenLedger.findMany({
          where: { type: 'REDEEM', refId: { in: ids }, delta: { lt: 0 } },
        })
      : [];
    const spentByRedemption = new Map<string, number>();
    for (const c of redeemCharges) {
      spentByRedemption.set(c.refId!, (spentByRedemption.get(c.refId!) ?? 0) - c.dollarEquivalent);
    }
    // Who fulfilled/rejected it is adult-only context; co-view charges and
    // spend amounts aren't sensitive (it's the redeemer's own history either
    // way) so those show for everyone.
    return {
      items: items.map(({ approvedByUser, ...r }) => ({
        ...(isAdult ? { ...r, approvedByUser } : r),
        coViewers: coViewersByRedemption.get(r.id) ?? [],
        tokensSpent: Math.round((spentByRedemption.get(r.id) ?? 0) / currentTokenValueUsd),
      })),
      hasMore,
    };
  }

  // Adult charges a family member who watched/used along with whoever
  // actually redeemed this - see PLANNING.md's fairness note. A debit ledger
  // entry linked back to the redemption via refId; doesn't touch the
  // redemption itself or the original purchaser's balance in any way.
  async chargeCoViewer(familyId: string, actorId: string, redemptionId: string, targetUserId: string, tokens?: number) {
    await assertFeatureEnabled(this.prisma, familyId, 'tokens');
    await this.assertAdult(actorId);
    const r = await this.prisma.redemption.findUnique({ where: { id: redemptionId }, include: { prize: true } });
    if (!r || r.prize.familyId !== familyId) throw new NotFoundException('Redemption not found');
    if (r.status !== 'FULFILLED') throw new BadRequestException('Only a fulfilled redemption can be split with a co-viewer');
    if (targetUserId === r.userId) throw new BadRequestException("Can't charge the person who redeemed it");
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    // Same loud-not-silent convention as tokens.service.adjust() - a co-view
    // charge is a deliberate adult action against someone's balance.
    if (target.tokensDisabled) throw new BadRequestException(`${target.displayName} has tokens turned off`);
    const amount = tokens ?? r.prize.tokenCost * r.quantity;
    if (!Number.isInteger(amount) || amount <= 0) throw new BadRequestException('Amount must be a positive whole number');
    const entry = await this.prisma.tokenLedger.create({
      data: {
        userId: targetUserId,
        delta: -amount,
        reason: `Co-viewed: ${r.prize.name}`,
        type: 'CO_VIEW',
        refId: r.id,
        createdById: actorId,
      },
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return entry;
  }
}
