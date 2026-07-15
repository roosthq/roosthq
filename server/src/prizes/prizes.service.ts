import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface PrizeInput {
  name: string;
  description?: string;
  image?: string;
  url?: string;
  realPrice?: number;
  tokenCost: number;
  type?: 'ITEM' | 'EVENT';
  scope?: 'GLOBAL' | 'SPECIFIC';
  assignedUserIds?: string[];
  locationId?: string | null;
  repeatable?: boolean;
  archived?: boolean;
}

@Injectable()
export class PrizesService {
  constructor(private prisma: PrismaService) {}

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'ADULT';
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

  // Non-adult visibility: global + assigned scope, not archived, and — for a
  // located prize — only if the person belongs to that location, UNLESS the
  // prize is assigned to them directly (that overrides the location gate).
  private visibleTo(
    p: { scope: string; archived: boolean; locationId: string | null; assignments: { userId: string }[] },
    actingUserId: string,
    myLocationIds: Set<string>,
  ): boolean {
    if (p.archived) return false;
    const assignedToMe = p.assignments.some((a) => a.userId === actingUserId);
    if (p.scope !== 'GLOBAL' && !assignedToMe) return false;
    if (p.locationId && !assignedToMe && !myLocationIds.has(p.locationId)) return false;
    return true;
  }

  // Adults see everything (incl. real price, archived prizes); kids see only
  // what visibleTo() allows, no real price.
  async list(familyId: string, actingUserId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId }, include: { locations: true } });
    const adult = !!actor && this.isAdult(actor.role);
    const myLocationIds = new Set((actor?.locations ?? []).map((l) => l.locationId));
    const prizes = await this.prisma.prize.findMany({
      where: { familyId },
      include: { assignments: true, location: true, creator: { select: { id: true, displayName: true } } },
    });
    return prizes
      .filter((p) => adult || this.visibleTo(p, actingUserId, myLocationIds))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image: p.image,
        url: adult ? p.url : undefined,
        realPrice: adult ? p.realPrice : undefined, // hidden from kids
        tokenCost: p.tokenCost,
        type: p.type,
        scope: p.scope,
        assignedUserIds: p.assignments.map((a) => a.userId),
        location: p.location ? { id: p.location.id, name: p.location.name } : null,
        repeatable: p.repeatable,
        archived: p.archived,
        createdByName: p.creator?.displayName ?? null,
      }));
  }

  async create(familyId: string, actorId: string, dto: PrizeInput) {
    await this.assertAdult(actorId);
    return this.prisma.prize.create({
      data: {
        familyId,
        name: dto.name,
        description: dto.description,
        image: dto.image,
        url: dto.url,
        realPrice: dto.realPrice ?? null,
        tokenCost: dto.tokenCost ?? 0,
        type: dto.type ?? 'ITEM',
        scope: dto.scope ?? 'GLOBAL',
        locationId: dto.locationId ?? null,
        repeatable: dto.repeatable ?? true,
        createdById: actorId,
        assignments:
          dto.scope === 'SPECIFIC' && dto.assignedUserIds?.length
            ? { create: dto.assignedUserIds.map((userId) => ({ userId })) }
            : undefined,
      },
    });
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
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.realPrice !== undefined && { realPrice: dto.realPrice }),
        ...(dto.tokenCost !== undefined && { tokenCost: dto.tokenCost }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.scope !== undefined && { scope: dto.scope }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.repeatable !== undefined && { repeatable: dto.repeatable }),
        ...(dto.archived !== undefined && { archived: dto.archived }),
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
    return this.prisma.prize.findUnique({
      where: { id },
      include: { assignments: true, location: true, creator: { select: { id: true, displayName: true } } },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    await this.prisma.prize.delete({ where: { id } });
    return { ok: true };
  }

  // Redeem: check eligibility + balance, deduct tokens (ledger), record the
  // purchase, and — for a non-repeatable prize — archive it so it drops out of
  // the active store once someone's bought it.
  async redeem(familyId: string, actingUserId: string, prizeId: string) {
    const prize = await this.prisma.prize.findFirst({
      where: { id: prizeId, familyId },
      include: { assignments: true },
    });
    if (!prize) throw new NotFoundException('Prize not found');

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
      // The sale didn't go through — put a one-off prize back in the store.
      if (!r.prize.repeatable && r.prize.archived) {
        await this.prisma.prize.update({ where: { id: r.prizeId }, data: { archived: false } });
      }
    }
    return this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status, approvedBy: actorId },
    });
  }

  // EVENT prizes only: mark whether the actual event has happened yet —
  // separate from FULFILLED, which just means the redemption was approved.
  async setRedemptionUsed(familyId: string, actorId: string, redemptionId: string, used: boolean) {
    await this.assertAdult(actorId);
    const r = await this.prisma.redemption.findUnique({ where: { id: redemptionId }, include: { prize: true } });
    if (!r || r.prize.familyId !== familyId) throw new NotFoundException('Redemption not found');
    return this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { usedAt: used ? new Date() : null },
    });
  }

  // Purchase history: a member's own, the whole family, or (adults only) one
  // prize's full buyer history — surfaced in that prize's detail view.
  async redemptions(familyId: string, actingUserId: string, opts: { userId?: string; prizeId?: string } = {}) {
    if (opts.prizeId) await this.assertAdult(actingUserId);
    return this.prisma.redemption.findMany({
      where: {
        prize: { familyId },
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.prizeId ? { prizeId: opts.prizeId } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: {
        prize: { select: { name: true, tokenCost: true, type: true } },
        user: { select: { id: true, displayName: true } },
      },
    });
  }
}
