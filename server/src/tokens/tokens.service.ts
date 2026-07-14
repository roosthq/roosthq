import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TokensService {
  constructor(private prisma: PrismaService) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'ADULT')) throw new ForbiddenException('Adults only');
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

  // Full transaction history for a member (earning + spending).
  async ledger(familyId: string, userId: string) {
    const member = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    return this.prisma.tokenLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
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
    return this.prisma.tokenLedger.create({
      data: { userId, delta, reason: reason.trim(), type, createdById: actorId },
    });
  }
}
