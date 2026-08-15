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
import { SessionPayload } from '../auth/jwt';

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
  type?: 'ITEM' | 'EVENT';
  scope?: 'GLOBAL' | 'SPECIFIC';
  assignedUserIds?: string[];
  locationId?: string | null;
  repeatable?: boolean;
  archived?: boolean;
  suggested?: boolean;
  // 'STORE' (default) or 'AWARD_ONLY' - see schema.prisma's Prize.visibility.
  visibility?: 'STORE' | 'AWARD_ONLY';
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

  // Adults see everything (incl. real price, archived prizes, all
  // suggestions); kids see only what visibleTo() allows, no real price.
  async list(familyId: string, actingUserId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'store'))) return [];
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId }, include: { locations: true } });
    const adult = !!actor && this.isAdult(actor.role);
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
    return prizes
      .filter((p) => adult || this.visibleTo(p, actingUserId, myLocationIds))
      .map((p) => ({
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
      }));
  }

  async create(familyId: string, actorId: string, dto: PrizeInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'store');
    await this.assertAdult(actorId);
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
        type: dto.type ?? 'ITEM',
        scope: dto.scope ?? 'GLOBAL',
        visibility: dto.visibility ?? 'STORE',
        locationId: dto.locationId ?? null,
        repeatable: dto.repeatable ?? true,
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
      link: '/store',
      refId: prize.id,
    });
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return prize;
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<PrizeInput>) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
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
        ...(dto.repeatable !== undefined && { repeatable: dto.repeatable }),
        ...(dto.archived !== undefined && { archived: dto.archived }),
        ...(dto.suggested !== undefined && { suggested: dto.suggested }),
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

  // Redeem: check eligibility + balance, deduct tokens (ledger), record the
  // purchase, and - for a non-repeatable prize - archive it so it drops out of
  // the active store once someone's bought it.
  async redeem(familyId: string, actingUserId: string, prizeId: string, actingSession?: SessionPayload) {
    await assertFeatureEnabled(this.prisma, familyId, 'store');
    await assertKidPermission(this.prisma, actingUserId, 'store');
    // A ghost/kiosk session shouldn't be able to spend an away/vacation
    // person's tokens on their behalf - they're not there to actually get it.
    await this.presence.assertActionable(actingSession ?? { userId: actingUserId, familyId });
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

    const bal = await this.balance(actingUserId);
    if (bal < prize.tokenCost) throw new BadRequestException('Not enough tokens');
    const redemption = await this.prisma.redemption.create({
      data: { prizeId, userId: actingUserId, status: 'REQUESTED' },
    });
    await this.prisma.tokenLedger.create({
      data: {
        userId: actingUserId,
        delta: -prize.tokenCost,
        reason: `Redeemed: ${prize.name}`,
        type: 'REDEEM',
        refId: redemption.id,
        createdById: actingUserId,
      },
    });
    if (!prize.repeatable) {
      await this.prisma.prize.update({ where: { id: prizeId }, data: { archived: true } });
    }
    await this.notifications.notifyAdults(familyId, 'REDEMPTION_REQUESTED', `${actor.displayName} wants "${prize.name}"`, {
      link: '/store',
      excludeUserId: actingUserId,
      refId: redemption.id,
    });
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
    if (status === 'REJECTED' && r.status !== 'REJECTED') {
      await this.prisma.tokenLedger.create({
        data: {
          userId: r.userId,
          delta: r.prize.tokenCost,
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
    await this.notifications.create(
      familyId,
      r.userId,
      status === 'FULFILLED' ? 'REDEMPTION_FULFILLED' : 'REDEMPTION_REJECTED',
      status === 'FULFILLED' ? `"${r.prize.name}" is ready!` : `"${r.prize.name}" was declined - tokens refunded`,
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
        prize: { select: { name: true, tokenCost: true, type: true } },
        user: { select: { id: true, displayName: true } },
        approvedByUser: { select: { id: true, displayName: true } },
      },
    });
    const { items, hasMore } = paginate(redemptions, take);
    // Who fulfilled/rejected it is adult-only context.
    return { items: items.map(({ approvedByUser, ...r }) => (isAdult ? { ...r, approvedByUser } : r)), hasMore };
  }
}
