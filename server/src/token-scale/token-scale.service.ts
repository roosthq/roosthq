import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';

// Token rescaling - PLANNING.md §17. Family-manager-only: change
// Family.tokenValueUsd (either direction, any value) and every current
// token-denominated number in the family scales to match, so the kids can't
// reverse-engineer the $ ratio from patterns. Level/XP never moves (see
// users.service.ts levelCheck / chores.service.ts balances /
// LevelBadge.tsx) - those already sum an invariant lifetime total that this
// feature only ever ADDS a `REBASE` ledger row to, never edits.
//
// Test Family only, never a real family, while this feature is new - see
// PLANNING.md §17's own note on that.
@Injectable()
export class TokenScaleService {
  constructor(
    private prisma: PrismaService,
    private displayEvents: DisplayEventsService,
  ) {}

  private async assertManager(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'FAMILY_MANAGER')) {
      throw new ForbiddenException('Family managers only');
    }
    return u;
  }

  // Shared by preview() and commit() so the preview literally cannot drift
  // from what committing would actually do - same query, same rounding.
  private async computePlan(familyId: string, newTokenValueUsd: number) {
    const family = await this.prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    const factor = family.tokenValueUsd / newTokenValueUsd;
    const [balances, users] = await Promise.all([
      this.prisma.tokenLedger.groupBy({ by: ['userId'], _sum: { delta: true }, where: { user: { familyId } } }),
      this.prisma.user.findMany({ where: { familyId }, select: { id: true, displayName: true, role: true } }),
    ]);
    const balanceById = new Map(balances.map((b) => [b.userId, b._sum.delta ?? 0]));
    const members = users.map((u) => {
      const balanceBefore = balanceById.get(u.id) ?? 0;
      const balanceAfter = Math.round(balanceBefore * factor);
      return {
        userId: u.id,
        displayName: u.displayName,
        balanceBefore,
        balanceAfter,
        rebaseDelta: balanceAfter - balanceBefore,
        // Had a real balance, but it'd round down to next-to-nothing - the
        // guardrail from PLANNING.md §17's worked examples (scaling DOWN
        // hard enough crushes small numbers to 0-1 and loses all
        // resolution). Doesn't block anything, just surfaced.
        crushWarning: Math.abs(balanceBefore) > 1 && Math.abs(balanceAfter) <= 1,
      };
    });
    // "Clean" ratio = either direction divides evenly (within float slop) -
    // 100 tokens per $1, or $100 per token, are both clean; $0.35/token
    // isn't. Doesn't block anything either - Casey's own call: warn, then
    // let it through if they still want it, since two equal balances today
    // rounding a token or two apart afterward is cosmetic, not accounting.
    const inv = 1 / factor;
    const cleanRatio = Math.abs(factor - Math.round(factor)) < 1e-6 || Math.abs(inv - Math.round(inv)) < 1e-6;
    return { family, factor, cleanRatio, members };
  }

  async preview(familyId: string, actorId: string, newTokenValueUsd: number) {
    await this.assertManager(actorId);
    if (!(newTokenValueUsd > 0)) throw new BadRequestException('Token value must be a positive number');
    const { family, factor, cleanRatio, members } = await this.computePlan(familyId, newTokenValueUsd);
    const [choreCount, prizeCount, awardCount, gameCount] = await Promise.all([
      this.prisma.chore.count({
        where: { familyId, OR: [{ tokenValue: { gt: 0 } }, { firstFinisherBonus: { gt: 0 } }, { streakBonusTokens: { gt: 0 } }] },
      }),
      this.prisma.prize.count({ where: { familyId, tokenCost: { gt: 0 } } }),
      this.prisma.award.count({ where: { familyId, OR: [{ defaultTokenValue: { gt: 0 } }, { wheelMax: { gt: 0 } }] } }),
      this.prisma.rewardGame.count({ where: { familyId, amount: null } }),
    ]);
    return {
      oldTokenValueUsd: family.tokenValueUsd,
      newTokenValueUsd,
      factor,
      cleanRatio,
      members,
      affected: { chores: choreCount, prizes: prizeCount, awards: awardCount, unplayedGames: gameCount },
    };
  }

  async commit(familyId: string, actorId: string, newTokenValueUsd: number) {
    const actor = await this.assertManager(actorId);
    if (!(newTokenValueUsd > 0)) throw new BadRequestException('Token value must be a positive number');
    const { family, factor, members } = await this.computePlan(familyId, newTokenValueUsd);
    const mult = (n: number) => Math.round(n * factor);

    await this.prisma.$transaction(async (tx) => {
      await tx.family.update({
        where: { id: familyId },
        data: {
          tokenValueUsd: newTokenValueUsd,
          streakWheelMin: mult(family.streakWheelMin),
          streakWheelMax: mult(family.streakWheelMax),
        },
      });

      const chores = await tx.chore.findMany({
        where: { familyId },
        select: { id: true, tokenValue: true, firstFinisherBonus: true, streakBonusTokens: true },
      });
      for (const c of chores) {
        await tx.chore.update({
          where: { id: c.id },
          data: { tokenValue: mult(c.tokenValue), firstFinisherBonus: mult(c.firstFinisherBonus), streakBonusTokens: mult(c.streakBonusTokens) },
        });
      }

      const prizes = await tx.prize.findMany({ where: { familyId }, select: { id: true, tokenCost: true } });
      for (const p of prizes) {
        await tx.prize.update({ where: { id: p.id }, data: { tokenCost: mult(p.tokenCost) } });
      }

      const awards = await tx.award.findMany({ where: { familyId }, select: { id: true, defaultTokenValue: true, wheelMin: true, wheelMax: true } });
      for (const a of awards) {
        await tx.award.update({
          where: { id: a.id },
          data: { defaultTokenValue: mult(a.defaultTokenValue), wheelMin: mult(a.wheelMin), wheelMax: mult(a.wheelMax) },
        });
      }

      // Not-yet-played only - an already-rolled amount is history (same
      // rule as everywhere else). Deliberately NOT touching poolJson here
      // (the weighted "Pool" reward type's own embedded token ranges) -
      // known gap, flagged rather than silently skipped: a pool-type award/
      // game's TOKENS entries won't rescale. Follow-up if it turns out to
      // matter in practice.
      const games = await tx.rewardGame.findMany({ where: { familyId, amount: null }, select: { id: true, minTokens: true, maxTokens: true } });
      for (const g of games) {
        await tx.rewardGame.update({ where: { id: g.id }, data: { minTokens: mult(g.minTokens), maxTokens: mult(g.maxTokens) } });
      }

      const usersWithAllowance = await tx.user.findMany({ where: { familyId, allowanceTokens: { gt: 0 } }, select: { id: true, allowanceTokens: true } });
      for (const u of usersWithAllowance) {
        await tx.user.update({ where: { id: u.id }, data: { allowanceTokens: mult(u.allowanceTokens) } });
      }

      for (const m of members) {
        if (m.rebaseDelta === 0) continue;
        await tx.tokenLedger.create({
          data: {
            userId: m.userId,
            delta: m.rebaseDelta,
            reason: `Token value changed: $${family.tokenValueUsd} → $${newTokenValueUsd} per token`,
            type: 'REBASE',
            createdById: actorId,
            // Set explicitly, not left to the create-time middleware
            // (prisma.service.ts) - that middleware doesn't fire for writes
            // made through this transaction's own `tx` client anyway, and
            // this is the one place that's authoritative about the value
            // taking effect at this exact instant. dollarEquivalent pinned
            // to 0 (not delta * newTokenValueUsd) as a second, independent
            // guard on top of the `type !== 'REBASE'` filter everywhere
            // "earned" is summed - a rebase is never real earning, full
            // stop, even if some future query forgets the type filter.
            tokenValueUsdAtCreation: newTokenValueUsd,
            dollarEquivalent: 0,
          },
        });
      }

      await tx.tokenScaleEvent.create({
        data: { familyId, actorId, oldTokenValueUsd: family.tokenValueUsd, newTokenValueUsd, factor },
      });
    });

    this.displayEvents.publish(familyId, { type: 'tokens' });
    this.displayEvents.publish(familyId, { type: 'chores' });
    this.displayEvents.publish(familyId, { type: 'prizes' });
    return { ok: true };
  }

  async history(familyId: string, actorId: string) {
    await this.assertManager(actorId);
    const rows = await this.prisma.tokenScaleEvent.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { displayName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      actorName: r.actor.displayName,
      oldTokenValueUsd: r.oldTokenValueUsd,
      newTokenValueUsd: r.newTokenValueUsd,
      factor: r.factor,
      createdAt: r.createdAt,
    }));
  }
}
