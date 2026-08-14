import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { assertFeatureEnabled } from '../common/features';

type LedgerType = 'MANUAL' | 'AWARD' | 'GAME' | 'CHORE_USED';

// User.bonusStreakFreezes is a person-level "wildcard" freeze bank - separate
// from the per-chore Chore.streakFreezes bank that's earned automatically at
// streak milestones and consumed first on a miss (see chores.service.ts).
// This one is only ever changed by an adult's deliberate action: a manual
// give/take, an award, or a reward-game win. It's checked as a fallback ONLY
// for a single-assignee chore whose own bank is already empty - a
// multi-assignee chore's shared streak has no one obvious person to charge
// a personal freeze to.
//
// Every mutation here also writes StreakFreezeLedger - this bank previously
// had no durable record at all beyond a one-off POST response, which is
// exactly why it went invisible after a grant (see ProfilePage's unified
// history). The per-chore bank's own earn/use events stay notification-only,
// unchanged - two disjoint sources merged client-side, not one shared log.
@Injectable()
export class StreakFreezeService {
  constructor(private prisma: PrismaService) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
  }

  private log(userId: string, delta: number, reason: string, type: LedgerType, createdById: string, refId?: string) {
    return this.prisma.streakFreezeLedger.create({ data: { userId, delta, reason, type, createdById, refId: refId ?? null } });
  }

  // Silent manual give/take (reason required) - same shape as
  // TokensService.adjust, but clamped at 0: unlike tokens there's no "debt"
  // concept for a freeze count going negative.
  async adjust(actorId: string, familyId: string, userId: string, delta: number, reason: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'streakFreeze');
    await this.assertAdult(actorId);
    if (!Number.isInteger(delta) || delta === 0) throw new BadRequestException('delta must be a non-zero integer');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    const member = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const bonusStreakFreezes = Math.max(0, member.bonusStreakFreezes + delta);
    const actuallyApplied = bonusStreakFreezes - member.bonusStreakFreezes; // clamp may shrink a big negative ask
    await this.prisma.user.update({ where: { id: userId }, data: { bonusStreakFreezes } });
    if (actuallyApplied !== 0) await this.log(userId, actuallyApplied, reason.trim(), 'MANUAL', actorId);
    return { userId, bonusStreakFreezes };
  }

  // Award/reward-game grant path - the award or pool entry granting this was
  // already an adult's deliberate choice when they set it up, so this skips
  // the adult/feature re-check (matches how AwardsService/RewardGamesService
  // never re-check the 'tokens' feature flag at grant time either).
  async grant(userId: string, amount: number, opts: { reason: string; createdById: string; refId?: string; type: 'AWARD' | 'GAME' }) {
    if (amount <= 0) return;
    await this.prisma.user.update({ where: { id: userId }, data: { bonusStreakFreezes: { increment: amount } } });
    await this.log(userId, amount, opts.reason, opts.type, opts.createdById, opts.refId);
  }

  // Reverse a specific grant (award/grant removed) - clamped at 0, same as
  // adjust(), since a takeback can't ever push the count negative.
  async take(userId: string, amount: number, opts: { reason: string; createdById: string; refId?: string }) {
    if (amount <= 0) return;
    const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { bonusStreakFreezes: true } });
    const bonusStreakFreezes = Math.max(0, (member?.bonusStreakFreezes ?? 0) - amount);
    const actuallyTaken = (member?.bonusStreakFreezes ?? 0) - bonusStreakFreezes;
    await this.prisma.user.update({ where: { id: userId }, data: { bonusStreakFreezes } });
    if (actuallyTaken > 0) await this.log(userId, -actuallyTaken, opts.reason, 'AWARD', opts.createdById, opts.refId);
  }

  // Chore-miss fallback (chores.service.ts), called only after the chore's
  // OWN bank is confirmed empty. Returns the post-consumption balance so the
  // caller can put an exact "N left" count in its own notification text,
  // same as the per-chore bank's own notification does today.
  async consumeOne(userId: string, opts: { reason: string; refId?: string }): Promise<{ consumed: boolean; remaining: number }> {
    const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { bonusStreakFreezes: true } });
    const remaining = member?.bonusStreakFreezes ?? 0;
    if (remaining <= 0) return { consumed: false, remaining: 0 };
    const next = remaining - 1;
    await this.prisma.user.update({ where: { id: userId }, data: { bonusStreakFreezes: next } });
    await this.log(userId, -1, opts.reason, 'CHORE_USED', userId, opts.refId);
    return { consumed: true, remaining: next };
  }
}
