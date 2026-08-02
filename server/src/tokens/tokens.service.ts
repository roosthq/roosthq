import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';

@Injectable()
export class TokensService {
  constructor(
    private prisma: PrismaService,
    private displayEvents: DisplayEventsService,
  ) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
  }

  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'FAMILY_MANAGER')) throw new ForbiddenException('Owner or family manager only');
  }

  // Balance for a single user (derived by summing the ledger).
  async balance(familyId: string, userId: string) {
    const member = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const agg = await this.prisma.tokenLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return { userId, balance: agg._sum.delta ?? 0 };
  }

  // Balances for the whole family.
  async balances(familyId: string) {
    const grouped = await this.prisma.tokenLedger.groupBy({
      by: ['userId'],
      _sum: { delta: true },
      where: { user: { familyId } },
    });
    return grouped.map((g) => ({ userId: g.userId, balance: g._sum.delta ?? 0 }));
  }

  // Full transaction history for a member (earning + spending). Who created
  // each entry (an adult's manual adjustment, an approval, an award) is
  // adult-only context — a kid sees the same entries minus that one field.
  async ledger(familyId: string, actingUserId: string, targetUserId: string) {
    const member = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    const isAdult = !!actor && ['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role);
    const entries = await this.prisma.tokenLedger.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { createdBy: { select: { displayName: true } } },
    });
    return entries.map((e) => ({
      id: e.id,
      delta: e.delta,
      reason: e.reason,
      type: e.type,
      refId: e.refId,
      createdAt: e.createdAt,
      createdByName: isAdult ? e.createdBy.displayName : undefined,
    }));
  }

  // Owner-only: strike a specific history entry entirely (not a reversing
  // entry like an award removal — this actually deletes the row, and since
  // balance is derived by summing the ledger, that alone corrects it).
  async deleteLedgerEntry(familyId: string, actorId: string, entryId: string) {
    await this.assertOwner(actorId);
    const entry = await this.prisma.tokenLedger.findFirst({ where: { id: entryId, user: { familyId } } });
    if (!entry) throw new NotFoundException('Ledger entry not found');
    await this.prisma.tokenLedger.delete({ where: { id: entryId } });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { ok: true };
  }

  // Adult manually awards/subtracts tokens (reason required), or reconciles physical
  // tokens. delta may be negative.
  async adjust(
    actorId: string,
    familyId: string,
    userId: string,
    delta: number,
    reason: string,
    type: 'MANUAL' | 'PHYSICAL' = 'MANUAL',
  ) {
    await this.assertAdult(actorId);
    if (!Number.isInteger(delta) || delta === 0) throw new BadRequestException('delta must be a non-zero integer');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    const member = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const entry = await this.prisma.tokenLedger.create({
      data: { userId, delta, reason: reason.trim(), type, createdById: actorId },
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return entry;
  }
}
