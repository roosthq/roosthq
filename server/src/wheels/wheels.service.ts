import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';

// Pending bonus wheels. Earning one (streak milestone, or an award an adult
// hands over) never banks tokens by itself - the person who EARNED it spins
// it, on their own screen or the kiosk, and the server rolls the amount at
// that moment. That way an adult approving a chore never "uses up" a kid's
// spin, and the reward stays unguessable until the wheel stops.
@Injectable()
export class WheelsService {
  constructor(
    private prisma: PrismaService,
    private displayEvents: DisplayEventsService,
  ) {}

  // Called from chores/awards when a wheel is earned.
  async create(familyId: string, userId: string, min: number, max: number, reason: string, refId?: string) {
    const lo = Math.max(1, Math.min(min, max));
    const hi = Math.max(lo, Math.max(min, max));
    const spin = await this.prisma.wheelSpin.create({
      data: { familyId, userId, minTokens: lo, maxTokens: hi, reason, refId: refId ?? null },
    });
    this.displayEvents.publish(familyId, { type: 'chores' });
    return spin;
  }

  // Everything this person still has to spin.
  pending(familyId: string, userId: string) {
    return this.prisma.wheelSpin.findMany({
      where: { familyId, userId, spunAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Spin it: roll inside the stored range, write the ledger entry, stamp it
  // spun. Only the owner of the wheel can spin (adults can't spin for a kid -
  // that's the whole point).
  async spin(familyId: string, userId: string, id: string) {
    const spin = await this.prisma.wheelSpin.findFirst({ where: { id, familyId } });
    if (!spin) throw new NotFoundException('Wheel not found');
    if (spin.userId !== userId) throw new ForbiddenException('Only the person who earned it can spin');
    if (spin.spunAt) return { alreadySpun: true, amount: spin.amount ?? 0, min: spin.minTokens, max: spin.maxTokens };

    const amount = spin.minTokens + Math.floor(Math.random() * (spin.maxTokens - spin.minTokens + 1));
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true } });
    await this.prisma.wheelSpin.update({ where: { id }, data: { amount, spunAt: new Date() } });
    if (!user?.tokensDisabled) {
      await this.prisma.tokenLedger.create({
        data: { userId, delta: amount, reason: spin.reason, type: 'STREAK_BONUS', refId: spin.refId, createdById: userId },
      });
    }
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { amount, min: spin.minTokens, max: spin.maxTokens, reason: spin.reason };
  }

  // An award grant being undone takes its wheel with it: an unspun wheel just
  // disappears; a spun one is reversed by the caller's ledger logic.
  async deleteUnspunFor(refId: string) {
    await this.prisma.wheelSpin.deleteMany({ where: { refId, spunAt: null } });
  }
}
