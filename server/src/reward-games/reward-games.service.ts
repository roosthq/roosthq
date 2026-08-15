import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StreakFreezeService } from '../streak-freeze/streak-freeze.service';
import { PresenceService } from '../presence/presence.service';
import { SessionPayload } from '../auth/jwt';

// Pending reward games (#5 - renamed/widened from the original single bonus
// wheel; RewardGame is @@map'd to the pre-existing WheelSpin table, see
// schema.prisma). Earning one (streak milestone, or an award an adult hands
// over) never banks tokens by itself - the person who EARNED it plays it, on
// their own screen or the kiosk, and the server rolls the outcome at that
// moment. That way an adult approving a chore never "uses up" a kid's turn,
// and the reward stays unguessable until it's revealed.

// The reveal presentation the client shows - purely cosmetic, spin() below
// rolls identically regardless of which one a given RewardGame got. Kept as
// plain strings (not a Prisma enum) so the client and this list can add a
// new style without a migration.
export const GAME_TYPES = [
  'WHEEL',
  'MYSTERY_BOX',
  'SCRATCH_CARD',
  'SLOT_MACHINE',
  'DICE_ROLL',
  'COIN_FLIP',
  'GIFT_BOX',
  'PLINKO',
] as const;
export type GameType = (typeof GAME_TYPES)[number];
// Old name, kept as an alias - nothing server-side outside this file needs
// the widened list under the old name, but avoids churning any stray import.
export const REWARD_STYLES = GAME_TYPES;
export type RewardStyle = GameType;

export type PoolEntry =
  | { kind: 'TOKENS'; min: number; max: number; weight?: number }
  | { kind: 'PRIZE'; prizeId: string; weight?: number }
  | { kind: 'STREAK_FREEZE'; min: number; max: number; weight?: number };

@Injectable()
export class RewardGamesService {
  constructor(
    private prisma: PrismaService,
    private displayEvents: DisplayEventsService,
    private notifications: NotificationsService,
    private streakFreeze: StreakFreezeService,
    private presence: PresenceService,
  ) {}

  // ---- Legacy/simple path: a plain token range, no prize pool. Unchanged
  // behavior from the original WheelsService - used by chores.service.ts's
  // streak-bonus wheel and awards.service.ts's plain wheelMin/wheelMax path.
  async create(familyId: string, userId: string, min: number, max: number, reason: string, refId?: string, style?: GameType) {
    const lo = Math.max(1, Math.min(min, max));
    const hi = Math.max(lo, Math.max(min, max));
    const chosenStyle = style ?? GAME_TYPES[Math.floor(Math.random() * GAME_TYPES.length)];
    const game = await this.prisma.rewardGame.create({
      data: { familyId, userId, minTokens: lo, maxTokens: hi, reason, refId: refId ?? null, style: chosenStyle },
    });
    this.displayEvents.publish(familyId, { type: 'chores' });
    return game;
  }

  // ---- #5 pool path: a weighted mix of token ranges and real Prizes. Saved
  // once on an Award (AwardsService reads poolJson/poolGameType/poolSlotCount
  // off the Award row), reused every time that award is granted - this just
  // queues one instance of it for one recipient.
  async createFromPool(
    familyId: string,
    userId: string,
    pool: PoolEntry[],
    opts: { reason: string; refId?: string; gameType?: GameType | null; slotCount?: number | null },
  ) {
    // Cosmetic min/max for the reveal animation (wheel wedges, slot reel
    // cycling) - derived from the pool's own ranged entries (tokens, then
    // freezes) so a mostly-ranged pool still looks proportionate; a
    // prize-only pool falls back to 1-5.
    const rangedEntries = pool.filter(
      (p): p is { kind: 'TOKENS' | 'STREAK_FREEZE'; min: number; max: number; weight?: number } =>
        p.kind === 'TOKENS' || p.kind === 'STREAK_FREEZE',
    );
    const tokenEntries = rangedEntries.filter((p) => p.kind === 'TOKENS');
    const preferred = tokenEntries.length ? tokenEntries : rangedEntries;
    const min = preferred.length ? Math.min(...preferred.map((p) => p.min)) : 1;
    const max = preferred.length ? Math.max(...preferred.map((p) => p.max)) : 5;
    const chosenStyle = opts.gameType ?? GAME_TYPES[Math.floor(Math.random() * GAME_TYPES.length)];
    const game = await this.prisma.rewardGame.create({
      data: {
        familyId,
        userId,
        minTokens: min,
        maxTokens: max,
        style: chosenStyle,
        poolJson: pool,
        slotCount: opts.slotCount ?? null,
        reason: opts.reason,
        refId: opts.refId ?? null,
      },
    });
    this.displayEvents.publish(familyId, { type: 'chores' });
    return game;
  }

  // Everything this person still has to play.
  pending(familyId: string, userId: string) {
    return this.prisma.rewardGame.findMany({
      where: { familyId, userId, spunAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Play it: roll (pool-weighted, or the legacy plain range), write the
  // ledger entry or auto-fulfilled Redemption, stamp it played. Only the
  // owner of the game can play it - adults can't play for a kid, that's the
  // whole point.
  async spin(familyId: string, userId: string, id: string, actingSession?: SessionPayload) {
    const game = await this.prisma.rewardGame.findFirst({ where: { id, familyId } });
    if (!game) throw new NotFoundException('Reward game not found');
    if (game.userId !== userId) throw new ForbiddenException('Only the person who earned it can play it');
    // Ghost/kiosk session playing on behalf of someone away/on vacation -
    // let the actual person spin their own wheel when they're back.
    await this.presence.assertActionable(actingSession ?? { userId, familyId });
    if (game.spunAt) {
      // Already played (e.g. a refreshed reveal modal) - return the same
      // shape a fresh roll would, so the client can still render it.
      if (game.wonKind === 'PRIZE' && game.wonPrizeId) {
        const prize = await this.prisma.prize.findUnique({ where: { id: game.wonPrizeId } });
        return { wonKind: 'PRIZE' as const, prize: prize ? { name: prize.name, icon: this.prizeIcon(prize) } : null, reason: game.reason };
      }
      if (game.wonKind === 'STREAK_FREEZE') {
        return { wonKind: 'STREAK_FREEZE' as const, amount: game.amount ?? 0, min: game.minTokens, max: game.maxTokens, reason: game.reason };
      }
      return { wonKind: 'TOKENS' as const, amount: game.amount ?? 0, min: game.minTokens, max: game.maxTokens, reason: game.reason };
    }

    if (game.poolJson) {
      return this.rollPool(game);
    }

    const amount = game.minTokens + Math.floor(Math.random() * (game.maxTokens - game.minTokens + 1));
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true } });
    await this.prisma.rewardGame.update({ where: { id }, data: { amount, wonKind: 'TOKENS', spunAt: new Date() } });
    if (!user?.tokensDisabled) {
      await this.prisma.tokenLedger.create({
        data: { userId, delta: amount, reason: game.reason, type: 'STREAK_BONUS', refId: game.refId, createdById: userId },
      });
    }
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { wonKind: 'TOKENS' as const, amount, min: game.minTokens, max: game.maxTokens, reason: game.reason };
  }

  // Prize has no dedicated emoji field (unlike Award) - `image` is a URL or a
  // data: URI, neither of which belongs in a plain-text reveal line. The
  // client falls back to a generic 🎁 whenever this is null.
  private prizeIcon(_prize: { image: string | null }): string | null {
    return null;
  }

  // Weighted pick from the pool, rolled the instant it's actually played -
  // nobody (adult or kid) sees or influences the result before this runs.
  private async rollPool(game: { id: string; familyId: string; userId: string; poolJson: unknown; refId: string | null; reason: string }) {
    const pool = game.poolJson as PoolEntry[];
    const totalWeight = pool.reduce((s, p) => s + (p.weight ?? 1), 0);
    let r = Math.random() * totalWeight;
    let picked: PoolEntry = pool[pool.length - 1];
    for (const p of pool) {
      r -= p.weight ?? 1;
      if (r <= 0) {
        picked = p;
        break;
      }
    }

    if (picked.kind === 'PRIZE') {
      const prize = await this.prisma.prize.findUnique({ where: { id: picked.prizeId } });
      await this.prisma.rewardGame.update({
        where: { id: game.id },
        data: { spunAt: new Date(), wonKind: 'PRIZE', wonPrizeId: picked.prizeId },
      });
      if (prize) {
        // Already won it - auto-fulfilled, no approve/reject step. Adults
        // still get notified since a physical prize still needs handing
        // over; `source: 'GAME'` keeps it out of the normal pending-approval
        // queue entirely (it's never status REQUESTED), so there's nothing
        // to reject.
        await this.prisma.redemption.create({
          data: { prizeId: picked.prizeId, userId: game.userId, status: 'FULFILLED', source: 'GAME' },
        });
        const winner = await this.prisma.user.findUnique({ where: { id: game.userId }, select: { displayName: true } });
        await this.notifications.notifyAdults(
          game.familyId,
          'GAME_PRIZE_WON',
          `🎁 ${winner?.displayName ?? 'Someone'} won "${prize.name}" from a reward game - get it ready for them!`,
          { link: '/store', excludeUserId: game.userId },
        );
      }
      this.displayEvents.publish(game.familyId, { type: 'tokens' });
      return { wonKind: 'PRIZE' as const, prize: prize ? { name: prize.name, icon: this.prizeIcon(prize) } : null, reason: game.reason };
    }

    if (picked.kind === 'STREAK_FREEZE') {
      const amount = picked.min + Math.floor(Math.random() * (picked.max - picked.min + 1));
      await this.prisma.rewardGame.update({ where: { id: game.id }, data: { spunAt: new Date(), amount, wonKind: 'STREAK_FREEZE' } });
      await this.streakFreeze.grant(game.userId, amount, {
        reason: game.reason,
        createdById: game.userId,
        refId: game.refId ?? undefined,
        type: 'GAME',
      });
      this.displayEvents.publish(game.familyId, { type: 'tokens' });
      return { wonKind: 'STREAK_FREEZE' as const, amount, min: picked.min, max: picked.max, reason: game.reason };
    }

    const amount = picked.min + Math.floor(Math.random() * (picked.max - picked.min + 1));
    const user = await this.prisma.user.findUnique({ where: { id: game.userId }, select: { tokensDisabled: true } });
    await this.prisma.rewardGame.update({ where: { id: game.id }, data: { spunAt: new Date(), amount, wonKind: 'TOKENS' } });
    if (!user?.tokensDisabled) {
      await this.prisma.tokenLedger.create({
        data: { userId: game.userId, delta: amount, reason: game.reason, type: 'STREAK_BONUS', refId: game.refId, createdById: game.userId },
      });
    }
    this.displayEvents.publish(game.familyId, { type: 'tokens' });
    return { wonKind: 'TOKENS' as const, amount, min: picked.min, max: picked.max, reason: game.reason };
  }

  // An award grant being undone takes its game with it: an unplayed one just
  // disappears; a played one is reversed by the caller's ledger logic.
  async deleteUnspunFor(refId: string) {
    await this.prisma.rewardGame.deleteMany({ where: { refId, spunAt: null } });
  }
}
