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

  // Adults see everything (incl. real price); kids see global + assigned, no real price.
  async list(familyId: string, actingUserId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    const adult = !!actor && this.isAdult(actor.role);
    const prizes = await this.prisma.prize.findMany({ where: { familyId }, include: { assignments: true } });
    return prizes
      .filter((p) => adult || p.scope === 'GLOBAL' || p.assignments.some((a) => a.userId === actingUserId))
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
    return this.prisma.prize.findUnique({ where: { id }, include: { assignments: true } });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    await this.prisma.prize.delete({ where: { id } });
    return { ok: true };
  }

  // Redeem: check balance, deduct tokens (ledger), record the purchase.
  async redeem(familyId: string, actingUserId: string, prizeId: string) {
    const prize = await this.owned(familyId, prizeId);
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
    }
    return this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status, approvedBy: actorId },
    });
  }

  // Purchase history (a member's, or the whole family).
  async redemptions(familyId: string, userId?: string) {
    return this.prisma.redemption.findMany({
      where: { prize: { familyId }, ...(userId ? { userId } : {}) },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: { prize: { select: { name: true, tokenCost: true, type: true } } },
    });
  }
}
