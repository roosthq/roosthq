import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DisplayEventsService } from '../display/display-events.service';
import { RewardGamesService, GAME_TYPES, PoolEntry, GameType } from '../reward-games/reward-games.service';
import { StreakFreezeService } from '../streak-freeze/streak-freeze.service';
import { assertFeatureEnabled, isFeatureEnabled } from '../common/features';
import { paginate } from '../common/pagination';

export interface AwardInput {
  name: string;
  icon?: string | null;
  description?: string | null;
  defaultTokenValue?: number;
  // Flat freeze count granted alongside the award - independent of
  // defaultTokenValue (an award can give tokens, freezes, both, or neither).
  defaultStreakFreezeValue?: number;
  wheelMin?: number;
  wheelMax?: number; // 0 = no wheel attached to this award
  // #5 "Pool" reward type - a third option alongside defaultTokenValue and
  // the plain wheelMin/wheelMax range. Mutually exclusive with both: when
  // set (non-empty), granting queues a pool-based RewardGame instead of
  // either of the other two, not additive with them.
  pool?: PoolEntry[] | null;
  gameType?: GameType | null; // pinned game type, or null/omitted = "surprise me"
  slotCount?: number | null;
}

export interface GrantInput {
  userId: string;
  note?: string;
  tokenValue?: number;
  streakFreezeValue?: number;
  // Per-grant override of the award's own wheel range. Omit to use the
  // award's default; send wheelMax 0 to hand this one over without a wheel.
  wheelMin?: number;
  wheelMax?: number;
}

@Injectable()
export class AwardsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
    private rewardGames: RewardGamesService,
    private streakFreeze: StreakFreezeService,
  ) {}

  // Whatever a client sends for pool, keep only well-shaped entries - same
  // never-trust-the-client-blindly spirit as sanitizeDisabledFeatures. An
  // empty/invalid pool is treated as "not using this reward type" (null).
  private sanitizePool(input: unknown): PoolEntry[] | null {
    if (!Array.isArray(input) || input.length === 0) return null;
    const out: PoolEntry[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const weight = typeof p.weight === 'number' && p.weight > 0 ? p.weight : 1;
      if (p.kind === 'TOKENS' && typeof p.min === 'number' && typeof p.max === 'number') {
        out.push({ kind: 'TOKENS', min: Math.max(0, Math.floor(p.min)), max: Math.max(0, Math.floor(p.max)), weight });
      } else if (p.kind === 'STREAK_FREEZE' && typeof p.min === 'number' && typeof p.max === 'number') {
        out.push({ kind: 'STREAK_FREEZE', min: Math.max(1, Math.floor(p.min)), max: Math.max(1, Math.floor(p.max)), weight });
      } else if (p.kind === 'PRIZE' && typeof p.prizeId === 'string' && p.prizeId) {
        out.push({ kind: 'PRIZE', prizeId: p.prizeId, weight });
      }
    }
    return out.length ? out : null;
  }

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !this.isAdult(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  private async owned(familyId: string, id: string) {
    const a = await this.prisma.award.findFirst({ where: { id, familyId } });
    if (!a) throw new NotFoundException('Award not found');
    return a;
  }

  // The full catalog - adults only, since a kid seeing this would spoil the
  // surprise of anything not yet given to them.
  async catalog(familyId: string, actorId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'awards'))) return [];
    await this.assertAdult(actorId);
    const awards = await this.prisma.award.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { grants: true } } },
    });
    return awards.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      description: a.description,
      defaultTokenValue: a.defaultTokenValue,
      defaultStreakFreezeValue: a.defaultStreakFreezeValue,
      wheelMin: a.wheelMin,
      wheelMax: a.wheelMax,
      pool: (a.poolJson as PoolEntry[] | null) ?? null,
      gameType: a.poolGameType as GameType | null,
      slotCount: a.poolSlotCount,
      grantCount: a._count.grants,
    }));
  }

  async create(familyId: string, actorId: string, dto: AwardInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'awards');
    await this.assertAdult(actorId);
    const pool = this.sanitizePool(dto.pool);
    return this.prisma.award.create({
      data: {
        familyId,
        name: dto.name,
        icon: dto.icon || null,
        description: dto.description || null,
        defaultTokenValue: Math.max(0, Math.floor(dto.defaultTokenValue ?? 0)),
        defaultStreakFreezeValue: Math.max(0, Math.floor(dto.defaultStreakFreezeValue ?? 0)),
        wheelMin: Math.max(1, Math.floor(dto.wheelMin ?? 1)),
        wheelMax: Math.max(0, Math.floor(dto.wheelMax ?? 0)),
        poolJson: (pool ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        poolGameType: pool && dto.gameType && GAME_TYPES.includes(dto.gameType) ? dto.gameType : null,
        poolSlotCount: pool ? (dto.slotCount ?? null) : null,
        createdById: actorId,
      },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<AwardInput>) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    const pool = dto.pool !== undefined ? this.sanitizePool(dto.pool) : undefined;
    return this.prisma.award.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.icon !== undefined && { icon: dto.icon || null }),
        ...(dto.description !== undefined && { description: dto.description || null }),
        ...(dto.defaultTokenValue !== undefined && { defaultTokenValue: Math.max(0, Math.floor(dto.defaultTokenValue)) }),
        ...(dto.defaultStreakFreezeValue !== undefined && {
          defaultStreakFreezeValue: Math.max(0, Math.floor(dto.defaultStreakFreezeValue)),
        }),
        ...(dto.wheelMin !== undefined && { wheelMin: Math.max(1, Math.floor(dto.wheelMin)) }),
        ...(dto.wheelMax !== undefined && { wheelMax: Math.max(0, Math.floor(dto.wheelMax)) }),
        ...(pool !== undefined && { poolJson: (pool ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue }),
        ...(dto.gameType !== undefined && { poolGameType: dto.gameType && GAME_TYPES.includes(dto.gameType) ? dto.gameType : null }),
        ...(dto.slotCount !== undefined && { poolSlotCount: dto.slotCount ?? null }),
      },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    // Grants cascade away with the award; their notifications don't (refId is
    // not a real FK), so collect the ids before the delete and clear them.
    const grants = await this.prisma.awardGrant.findMany({ where: { awardId: id }, select: { id: true } });
    await this.prisma.award.delete({ where: { id } });
    await this.notifications.removeByRef(grants.map((g) => g.id));
    return { ok: true };
  }

  // What a kid has actually been given - only award types with >=1 grant to
  // them, each with how many times. This is the one award-related view a kid
  // (or anyone looking at their own profile) is allowed to see.
  async earned(familyId: string, actingUserId: string, targetUserId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'awards'))) return [];
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actor) throw new ForbiddenException();
    if (!this.isAdult(actor.role) && actingUserId !== targetUserId) {
      throw new ForbiddenException("Can't see someone else's awards");
    }
    const grants = await this.prisma.awardGrant.findMany({
      where: { userId: targetUserId, award: { familyId } },
      include: { award: true },
      orderBy: { createdAt: 'desc' },
    });
    const byAward = new Map<
      string,
      { id: string; name: string; icon: string | null; description: string | null; count: number; notes: string[] }
    >();
    for (const g of grants) {
      const existing = byAward.get(g.awardId);
      // The adult's note on WHY this one was given ("for cleaning the
      // garage") - a kid earning the same award type more than once can have
      // a different reason each time, so this collects every non-empty one,
      // newest first (grants are already fetched in that order).
      if (existing) {
        existing.count += 1;
        if (g.note) existing.notes.push(g.note);
      } else {
        byAward.set(g.awardId, {
          id: g.award.id,
          name: g.award.name,
          icon: g.award.icon,
          description: g.award.description,
          count: 1,
          notes: g.note ? [g.note] : [],
        });
      }
    }
    return [...byAward.values()];
  }

  // Adults-only, family-wide grant history - who gave what to whom, the note,
  // the token value actually given, and when. Newest first.
  async history(familyId: string, actorId: string, skip = 0, take = 50) {
    await this.assertAdult(actorId);
    const grants = await this.prisma.awardGrant.findMany({
      where: { award: { familyId } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
      include: {
        award: { select: { id: true, name: true, icon: true } },
        user: { select: { id: true, displayName: true } },
        grantedBy: { select: { id: true, displayName: true } },
      },
    });
    const { items, hasMore } = paginate(grants, take);
    return {
      items: items.map((g) => ({
        id: g.id,
        award: g.award,
        user: g.user,
        grantedBy: g.grantedBy,
        note: g.note,
        tokenValue: g.tokenValue,
        streakFreezeValue: g.streakFreezeValue,
        createdAt: g.createdAt,
      })),
      hasMore,
    };
  }

  async grant(familyId: string, actorId: string, awardId: string, dto: GrantInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'awards');
    const actor = await this.assertAdult(actorId);
    const award = await this.owned(familyId, awardId);
    const recipient = await this.prisma.user.findFirst({ where: { id: dto.userId, familyId } });
    if (!recipient) throw new NotFoundException('Family member not found');
    // A pool award decides everything at play time - nothing gets banked at
    // grant time, no matter what the client sends. Enforced here too (not
    // just hidden client-side) since this is a real correctness bug if it
    // slips through: a kid seeing tokens land before they've even played
    // the game defeats the entire "find out by playing" point of it.
    const hasPool = !!(award.poolJson as unknown[] | null)?.length;
    const tokenValue = hasPool ? 0 : Math.max(0, Math.floor(dto.tokenValue ?? award.defaultTokenValue));
    // Same pool rule as tokens: nothing's decided until they actually play
    // it, so a pool award grants zero flat freezes too, regardless of what
    // the award's own default (unused while pool is set) says.
    const streakFreezeValue = hasPool ? 0 : Math.max(0, Math.floor(dto.streakFreezeValue ?? award.defaultStreakFreezeValue));
    const grant = await this.prisma.awardGrant.create({
      data: { awardId: award.id, userId: dto.userId, grantedById: actorId, note: dto.note || null, tokenValue, streakFreezeValue },
    });
    // The trophy/badge (AwardGrant) always records the award, same as a
    // chore always completes regardless - this only gates the ledger entry.
    if (tokenValue > 0 && !recipient.tokensDisabled) {
      await this.prisma.tokenLedger.create({
        data: {
          userId: dto.userId,
          delta: tokenValue,
          reason: `Award: ${award.name}`,
          type: 'AWARD',
          refId: grant.id,
          createdById: actorId,
        },
      });
    }
    // Not gated by tokensDisabled - freezes aren't tokens, and a family that
    // disabled tokens for someone hasn't necessarily opted them out of this.
    if (streakFreezeValue > 0) {
      await this.streakFreeze.grant(dto.userId, streakFreezeValue, {
        reason: `Award: ${award.name}`,
        createdById: actorId,
        refId: grant.id,
        type: 'AWARD',
      });
    }
    // Bonus wheel / reward game attached to this award: server picks the
    // outcome (client presentations are pure theater landing on it) - but
    // nothing is banked here: it's QUEUED for the recipient to play on their
    // own screen or the kiosk. The grown-up handing over the award never
    // plays it for them. Pool (#5) and the plain wheelMin/wheelMax range are
    // mutually exclusive reward types, not additive - pool wins if both are
    // somehow set (shouldn't happen; the client form is a radio choice).
    let wheelQueued = false;
    const pool = (award.poolJson as PoolEntry[] | null) ?? null;
    const wheelMax = Math.max(0, Math.floor(dto.wheelMax ?? award.wheelMax));
    const wheelMin = Math.max(1, Math.floor(dto.wheelMin ?? award.wheelMin));
    if (pool && !recipient.tokensDisabled) {
      await this.rewardGames.createFromPool(familyId, dto.userId, pool, {
        reason: `Reward game: ${award.name}`,
        refId: grant.id,
        gameType: award.poolGameType as GameType | null,
        slotCount: award.poolSlotCount,
      });
      wheelQueued = true;
      await this.notifications.create(
        familyId,
        dto.userId,
        'AWARD_GRANTED',
        `🎮 "${award.name}" comes with a reward game - go play it!`,
        { link: '/chores', refId: grant.id },
      );
    } else if (wheelMax > 0 && !recipient.tokensDisabled) {
      await this.rewardGames.create(familyId, dto.userId, wheelMin, wheelMax, `Bonus wheel: ${award.name}`, grant.id);
      wheelQueued = true;
      await this.notifications.create(
        familyId,
        dto.userId,
        'AWARD_GRANTED',
        `🎡 "${award.name}" comes with a bonus wheel - go spin it!`,
        { link: '/chores', refId: grant.id },
      );
    }
    await this.notifications.create(
      familyId,
      dto.userId,
      'AWARD_GRANTED',
      `${actor.displayName} gave you the "${award.name}" award!`,
      { link: '/profile', refId: grant.id },
    );
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { ...grant, wheelQueued };
  }

  // What removing this grant would cost the recipient in tokens, split by
  // source, so the confirm dialog can say exactly what the checkbox controls.
  async grantTokenImpact(familyId: string, actorId: string, grantId: string) {
    await this.assertAdult(actorId);
    const grant = await this.prisma.awardGrant.findFirst({
      where: { id: grantId, award: { familyId } },
      select: { id: true, userId: true, tokenValue: true },
    });
    if (!grant) throw new NotFoundException('Award grant not found');
    const wheel = await this.wheelTokensFor(grant.id);
    return { award: grant.tokenValue, wheel, total: grant.tokenValue + wheel };
  }

  // Net tokens a spun bonus wheel put in their pocket for this grant. Netted,
  // not summed, so a wheel bonus already reversed can't be clawed back twice.
  // No `type` filter on purpose: RewardGamesService.spin writes its ledger
  // entry as STREAK_BONUS (it serves streak milestones too) while the
  // reversal below is an AWARD entry - matching on refId plus the reason is
  // what actually identifies these rows.
  private async wheelTokensFor(grantId: string) {
    const entries = await this.prisma.tokenLedger.findMany({
      where: {
        refId: grantId,
        OR: [{ reason: { startsWith: 'Bonus wheel:' } }, { reason: { contains: '(wheel bonus)' } }],
      },
      select: { delta: true },
    });
    return entries.reduce((sum, e) => sum + e.delta, 0);
  }

  // Undo a specific grant: removes the badge (so it no longer counts toward
  // "earned") and, when `removeTokens`, reverses its tokens with a new negative
  // ledger entry rather than deleting the original - same audit-trail
  // convention as a rejected redemption refund elsewhere in this app.
  // `removeTokens: false` leaves the tokens banked (they earned them fairly,
  // the badge was just given by mistake).
  async removeGrant(familyId: string, actorId: string, grantId: string, opts: { removeTokens?: boolean } = {}) {
    await this.assertAdult(actorId);
    const removeTokens = opts.removeTokens ?? true;
    const grant = await this.prisma.awardGrant.findFirst({
      where: { id: grantId, award: { familyId } },
      include: { award: true },
    });
    if (!grant) throw new NotFoundException('Award grant not found');
    const recipient = await this.prisma.user.findUnique({ where: { id: grant.userId }, select: { tokensDisabled: true } });
    // An unspun wheel from this grant simply goes away, tokens or not - there
    // is nothing left to spin for.
    await this.rewardGames.deleteUnspunFor(grant.id);
    // Mirrors grant()'s own gate - if tokens were disabled (still are), no
    // forward entry exists to reverse; writing one anyway would be a
    // phantom negative entry with nothing to offset.
    if (removeTokens && !recipient?.tokensDisabled) {
      // A wheel they already spun gets reversed like any other award tokens.
      const wheelTokens = await this.wheelTokensFor(grant.id);
      if (wheelTokens > 0) {
        await this.prisma.tokenLedger.create({
          data: {
            userId: grant.userId,
            delta: -wheelTokens,
            reason: `Removed award: ${grant.award.name} (wheel bonus)`,
            type: 'AWARD',
            refId: grant.id,
            createdById: actorId,
          },
        });
      }
      if (grant.tokenValue > 0) {
        await this.prisma.tokenLedger.create({
          data: {
            userId: grant.userId,
            delta: -grant.tokenValue,
            reason: `Removed award: ${grant.award.name}`,
            type: 'AWARD',
            refId: grant.id,
            createdById: actorId,
          },
        });
      }
    }
    // Freezes aren't part of the removeTokens checkbox (that UI only ever
    // promised to leave TOKENS alone) - always clawed back on removal, same
    // as the badge itself always goes away regardless of that checkbox.
    if (grant.streakFreezeValue > 0) {
      await this.streakFreeze.take(grant.userId, grant.streakFreezeValue, {
        reason: `Removed award: ${grant.award.name}`,
        createdById: actorId,
        refId: grant.id,
      });
    }
    await this.prisma.awardGrant.delete({ where: { id: grantId } });
    // The "you got an award!" / "go spin your wheel" feed entries deep-link to
    // something that no longer exists - take them with it.
    await this.notifications.removeByRef(grant.id);
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { ok: true, tokensRemoved: removeTokens };
  }
}
