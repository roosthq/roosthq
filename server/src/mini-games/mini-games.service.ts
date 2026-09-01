import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DisplayEventsService } from '../display/display-events.service';
import { StreakFreezeService } from '../streak-freeze/streak-freeze.service';
import { assertFeatureEnabled, isFeatureEnabled } from '../common/features';
import { DEFAULT_TIMEZONE, startOfDayInZone, todayKeyInZone, weekRangeInZone } from '../common/timezone';
import type { PoolEntry } from '../reward-games/reward-games.service';

// A mini-game's own settings (step count, time limit, difficulty, misses
// allowed - whatever that gameType's sliders are) - deliberately untyped
// here, same free-form-Json spirit as Award.poolJson. The client owns the
// actual shape per gameType; the server just stores/returns it verbatim.
export type MiniGameConfig = Record<string, unknown>;

export interface MiniGameInput {
  name: string;
  icon?: string | null;
  description?: string | null;
  gameType: string;
  config: MiniGameConfig;
  pool: PoolEntry[];
  loseTokenValue?: number;
  partialCreditEnabled?: boolean;
  partialCreditPerStep?: number;
}

export interface GrantInput {
  userId: string;
  config?: MiniGameConfig; // omit to use the catalog's own default
  pool?: PoolEntry[]; // omit to use the catalog's own default
  loseTokenValue?: number;
  partialCreditEnabled?: boolean;
  partialCreditPerStep?: number;
}

export interface PublishTierInput {
  label: string;
  priceTokens: number;
  config: MiniGameConfig;
  pool: PoolEntry[];
  loseTokenValue?: number;
  partialCreditEnabled?: boolean;
  partialCreditPerStep?: number;
}

export interface PublishInput {
  miniGameId: string;
  tiers: PublishTierInput[];
  purchaseLimitCount?: number;
  purchaseLimitPeriod?: string; // DAY | WEEK | MONTH
}

export interface PlayReport {
  won: boolean;
  stepsCompleted: number;
  totalSteps: number;
  timeTakenSeconds: number;
}

type DrawnResult =
  | { kind: 'TOKENS'; amount: number }
  | { kind: 'PRIZE'; prizeId: string }
  | { kind: 'STREAK_FREEZE'; amount: number };

// The full ten-game roster from the Task Deck prototypes (PLANNING.md §18),
// icon + name + description exactly as the deck presented them - seeded into
// a family's catalog the first time it's fetched empty, so "all of them in
// the catalog by default" holds without an adult having to hand-recreate
// each one via the New-game form first. `gameType` matches the client's own
// GAME_TYPES list (web/src/pages/MiniGamesTab.tsx) value-for-value.
const DEFAULT_CATALOG: { gameType: string; name: string; icon: string; description: string; config: MiniGameConfig }[] = [
  { gameType: 'PIN_TUMBLER', name: 'Pin & Tumbler', icon: '🗝️', description: 'Push each pin to its shear line as it rises. More pins, tighter windows, each round.', config: { steps: 5, timeLimit: 25, misses: 3, difficulty: 1 } },
  { gameType: 'SAFE_CRACKER', name: 'Safe Cracker', icon: '🔐', description: 'Drag the dial until you hear the click, then tap SET. The dial stops exactly where you let go - no drift.', config: {} },
  { gameType: 'WIRE_SPLICE', name: 'Wire Splice', icon: '🔌', description: 'Drag each colored lead to its matching post before the timer runs out.', config: {} },
  { gameType: 'SIGNAL_RELAY', name: 'Signal Relay', icon: '📡', description: 'Watch the panel light up, then repeat the sequence. Grows by one every round survived.', config: {} },
  { gameType: 'CARGO_SORT', name: 'Cargo Sort', icon: '📦', description: 'Drag the scrambled crates into ascending order before the loading clock runs out.', config: {} },
  { gameType: 'FUSE_TRACE', name: 'Fuse Trace', icon: '⚡', description: 'Drag the live wire from spark to socket without touching the rails. Multiple stages, each with its own random layout.', config: {} },
  { gameType: 'REACTOR_CALIBRATION', name: 'Reactor Calibration', icon: '☢️', description: 'Nudge the needle into the drifting safe zone and hold it there. Drift outside it too long and the core overloads - instant loss.', config: {} },
  { gameType: 'BUG_ZAPPER', name: 'Bug Zapper', icon: '🪲', description: 'Tap the blips before they scurry off. Reach the zap quota before time runs out.', config: {} },
  { gameType: 'CIRCUIT_MATCH', name: 'Circuit Match', icon: '🧩', description: 'Flip tiles to find matching circuit symbols. Each pair found is a step toward the win.', config: {} },
  { gameType: 'CODE_BREAKER', name: 'Code Breaker', icon: '💻', description: 'Guess the hidden digit code. Hot/cold feedback narrows it down each try - partial credit per digit placed.', config: {} },
];
// Same default pool every seeded entry starts with (10-25 tokens, editable
// immediately) - an adult customizes or replaces it per game, same as any
// hand-created catalog entry.
const DEFAULT_SEED_POOL: PoolEntry[] = [{ kind: 'TOKENS', min: 10, max: 25, weight: 1 }];

@Injectable()
export class MiniGamesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
    private streakFreeze: StreakFreezeService,
  ) {}

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !this.isAdult(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  // Same never-trust-the-client-blindly shape as AwardsService.sanitizePool -
  // deliberately duplicated rather than imported/shared, since the two
  // services have no other coupling and this is small enough that sharing it
  // would cost more (an extra cross-module dependency) than it saves.
  private sanitizePool(input: unknown): PoolEntry[] {
    if (!Array.isArray(input) || input.length === 0) throw new BadRequestException('A prize pool is required');
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
    if (!out.length) throw new BadRequestException('A prize pool is required');
    return out;
  }

  private sanitizeConfig(input: unknown): MiniGameConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return input as MiniGameConfig;
  }

  private async owned(familyId: string, id: string) {
    const g = await this.prisma.miniGame.findFirst({ where: { id, familyId } });
    if (!g) throw new NotFoundException('Mini-game not found');
    return g;
  }

  // Weighted pick from a pool - pure, synchronous, rolled the instant it's
  // called. Callers roll this at grant/purchase CREATION (see PLANNING.md
  // §18 "Prize pre-determination"), not at play time.
  private draw(pool: PoolEntry[]): DrawnResult {
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
    if (picked.kind === 'PRIZE') return { kind: 'PRIZE', prizeId: picked.prizeId };
    const amount = picked.min + Math.floor(Math.random() * (picked.max - picked.min + 1));
    return picked.kind === 'STREAK_FREEZE' ? { kind: 'STREAK_FREEZE', amount } : { kind: 'TOKENS', amount };
  }

  private sanitizePeriod(input: unknown): string {
    return input === 'WEEK' || input === 'MONTH' ? input : 'DAY';
  }

  // Calendar-boundary start of the current DAY/WEEK/MONTH, family-timezone-
  // aware (no per-location timezone here - mini-games aren't scoped to a
  // house, so DEFAULT_TIMEZONE is the same fallback everything else uses
  // when there's no more specific zone to reach for). Week starts Monday,
  // same convention as weekRangeInZone's own callers.
  private purchaseLimitPeriodStart(period: string): Date {
    const key = todayKeyInZone(DEFAULT_TIMEZONE);
    if (period === 'WEEK') return new Date(weekRangeInZone(DEFAULT_TIMEZONE).start);
    if (period === 'MONTH') return startOfDayInZone({ y: key.y, m: key.m, d: 1 }, DEFAULT_TIMEZONE);
    return startOfDayInZone(key, DEFAULT_TIMEZONE);
  }

  // ---------------- Catalog (adult-only) ----------------

  async catalog(familyId: string, actorId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'miniGames'))) return [];
    await this.assertAdult(actorId);
    await this.ensureDefaultCatalog(familyId, actorId);
    return this.prisma.miniGame.findMany({ where: { familyId }, orderBy: { createdAt: 'asc' } });
  }

  // "All ten in the catalog by default" - checked and repaired on every
  // fetch, not a one-time seed: creates whichever of the ten default
  // gameTypes this family doesn't have yet (so a family that already had
  // one entry, e.g. a hand-made Pin & Tumbler from before this existed,
  // still gets the other nine), and backfills icon/description onto an
  // existing entry that's missing one - the deck's own copy is the source
  // of truth for that text, not something an adult should have to retype.
  // Never touches name/pool/config on an existing row - those are the
  // adult's own to customize once a game exists.
  private async ensureDefaultCatalog(familyId: string, actorId: string) {
    const existing = await this.prisma.miniGame.findMany({ where: { familyId } });
    const byType = new Map(existing.map((g) => [g.gameType, g]));
    for (const def of DEFAULT_CATALOG) {
      const cur = byType.get(def.gameType);
      if (!cur) {
        await this.prisma.miniGame.create({
          data: {
            familyId,
            name: def.name,
            icon: def.icon,
            description: def.description,
            gameType: def.gameType,
            configJson: def.config as Prisma.InputJsonValue,
            poolJson: DEFAULT_SEED_POOL as unknown as Prisma.InputJsonValue,
            createdById: actorId,
          },
        });
      } else if (!cur.icon || !cur.description) {
        await this.prisma.miniGame.update({
          where: { id: cur.id },
          data: { icon: cur.icon || def.icon, description: cur.description || def.description },
        });
      }
    }
  }

  async create(familyId: string, actorId: string, dto: MiniGameInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'miniGames');
    await this.assertAdult(actorId);
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    const pool = this.sanitizePool(dto.pool);
    return this.prisma.miniGame.create({
      data: {
        familyId,
        name: dto.name.trim(),
        icon: dto.icon ?? null,
        description: dto.description ?? null,
        gameType: dto.gameType,
        configJson: this.sanitizeConfig(dto.config) as Prisma.InputJsonValue,
        poolJson: pool as unknown as Prisma.InputJsonValue,
        loseTokenValue: Math.max(0, Math.floor(dto.loseTokenValue ?? 0)),
        partialCreditEnabled: !!dto.partialCreditEnabled,
        partialCreditPerStep: Math.max(0, Math.floor(dto.partialCreditPerStep ?? 0)),
        createdById: actorId,
      },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<MiniGameInput>) {
    await assertFeatureEnabled(this.prisma, familyId, 'miniGames');
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    return this.prisma.miniGame.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.gameType !== undefined && { gameType: dto.gameType }),
        ...(dto.config !== undefined && { configJson: this.sanitizeConfig(dto.config) as Prisma.InputJsonValue }),
        ...(dto.pool !== undefined && { poolJson: this.sanitizePool(dto.pool) as unknown as Prisma.InputJsonValue }),
        ...(dto.loseTokenValue !== undefined && { loseTokenValue: Math.max(0, Math.floor(dto.loseTokenValue)) }),
        ...(dto.partialCreditEnabled !== undefined && { partialCreditEnabled: !!dto.partialCreditEnabled }),
        ...(dto.partialCreditPerStep !== undefined && { partialCreditPerStep: Math.max(0, Math.floor(dto.partialCreditPerStep)) }),
      },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    await this.prisma.miniGame.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------- Grants (adult hands one directly to a kid) ----------------

  async grant(familyId: string, actorId: string, miniGameId: string, dto: GrantInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'miniGames');
    const actor = await this.assertAdult(actorId);
    const game = await this.owned(familyId, miniGameId);
    const recipient = await this.prisma.user.findFirst({ where: { id: dto.userId, familyId } });
    if (!recipient) throw new NotFoundException('Family member not found');
    const config = this.sanitizeConfig(dto.config ?? game.configJson);
    const pool = this.sanitizePool(dto.pool ?? (game.poolJson as unknown[]));
    const loseTokenValue = Math.max(0, Math.floor(dto.loseTokenValue ?? game.loseTokenValue));
    const partialCreditEnabled = dto.partialCreditEnabled ?? game.partialCreditEnabled;
    const partialCreditPerStep = Math.max(0, Math.floor(dto.partialCreditPerStep ?? game.partialCreditPerStep));
    // Drawn NOW, not at play time - see PLANNING.md §18 "Prize pre-determination".
    const drawnResult = this.draw(pool);
    const grant = await this.prisma.miniGameGrant.create({
      data: {
        miniGameId,
        userId: dto.userId,
        grantedById: actorId,
        configJson: config as Prisma.InputJsonValue,
        poolJson: pool as unknown as Prisma.InputJsonValue,
        loseTokenValue,
        partialCreditEnabled,
        partialCreditPerStep,
        drawnResultJson: drawnResult as unknown as Prisma.InputJsonValue,
      },
    });
    await this.notifications.create(familyId, dto.userId, 'MINI_GAME_GRANTED', `${actor.displayName} gave you "${game.name}" to play!`, {
      link: '/store?tab=games',
      refId: grant.id,
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return grant;
  }

  // Kid-facing queue - also where any grant abandoned mid-play (IN_PROGRESS,
  // never resolved) gets swept to FORFEITED first. See PLANNING.md §18
  // "Prize pre-determination & abandonment": a legitimately in-progress
  // session never re-fetches its own grant, so this only ever catches a
  // truly abandoned one.
  async pendingGrants(familyId: string, userId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'miniGames'))) return [];
    await this.forfeitStaleInProgress(familyId, userId);
    const grants = await this.prisma.miniGameGrant.findMany({
      where: { userId, miniGame: { familyId }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      include: { miniGame: { select: { name: true, icon: true, description: true, gameType: true } } },
    });
    return grants.map((g) => this.presentPlaySession(g, g.miniGame, g.configJson));
  }

  async startGrant(familyId: string, userId: string, id: string) {
    return this.startSession('grant', familyId, userId, id);
  }

  async playGrant(familyId: string, userId: string, id: string, report: PlayReport) {
    return this.resolvePlay('grant', familyId, userId, id, report);
  }

  // ---------------- Publishing (adult defines buyable tiers) ----------------

  async listPublished(familyId: string, actorId: string, activeOnly: boolean) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'miniGames'))) return [];
    if (!activeOnly) await this.assertAdult(actorId);
    const published = await this.prisma.publishedMiniGame.findMany({
      where: { familyId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        miniGame: { select: { name: true, icon: true, description: true, gameType: true } },
        tiers: { orderBy: { sort: 'asc' } },
      },
    });
    // Kid shop context only (activeOnly) - `actorId` here IS the browsing
    // kid's own userId (see controller), so "how many of MY purchases of
    // this game count against the limit" is answerable. The adult's own
    // Published-games list has no such "my remaining plays" concept, so it
    // skips this and just gets the raw limit setting to edit.
    if (!activeOnly) return published;
    return Promise.all(
      published.map(async (p) => {
        const since = this.purchaseLimitPeriodStart(p.purchaseLimitPeriod);
        const used = await this.prisma.miniGamePurchase.count({
          where: { userId: actorId, createdAt: { gte: since }, tier: { publishedGameId: p.id } },
        });
        return { ...p, purchasesUsed: used, purchasesRemaining: Math.max(0, p.purchaseLimitCount - used) };
      }),
    );
  }

  async publish(familyId: string, actorId: string, dto: PublishInput) {
    await assertFeatureEnabled(this.prisma, familyId, 'miniGames');
    await this.assertAdult(actorId);
    await this.owned(familyId, dto.miniGameId);
    if (!dto.tiers?.length) throw new BadRequestException('At least one tier is required');
    return this.prisma.publishedMiniGame.create({
      data: {
        familyId,
        miniGameId: dto.miniGameId,
        createdById: actorId,
        purchaseLimitCount: Math.max(1, Math.floor(dto.purchaseLimitCount ?? 1)),
        purchaseLimitPeriod: this.sanitizePeriod(dto.purchaseLimitPeriod),
        tiers: {
          create: dto.tiers.map((t, i) => ({
            label: t.label?.trim() || `Tier ${i + 1}`,
            priceTokens: Math.max(0, Math.floor(t.priceTokens)),
            configJson: this.sanitizeConfig(t.config) as Prisma.InputJsonValue,
            poolJson: this.sanitizePool(t.pool) as unknown as Prisma.InputJsonValue,
            loseTokenValue: Math.max(0, Math.floor(t.loseTokenValue ?? 0)),
            partialCreditEnabled: !!t.partialCreditEnabled,
            partialCreditPerStep: Math.max(0, Math.floor(t.partialCreditPerStep ?? 0)),
            sort: i,
          })),
        },
      },
      include: { tiers: { orderBy: { sort: 'asc' } } },
    });
  }

  async setPublishedActive(familyId: string, actorId: string, id: string, active: boolean) {
    await this.assertAdult(actorId);
    const p = await this.prisma.publishedMiniGame.findFirst({ where: { id, familyId } });
    if (!p) throw new NotFoundException('Published game not found');
    return this.prisma.publishedMiniGame.update({ where: { id }, data: { active } });
  }

  async updateTiers(
    familyId: string,
    actorId: string,
    id: string,
    tiers: PublishTierInput[],
    limit?: { purchaseLimitCount?: number; purchaseLimitPeriod?: string },
  ) {
    await assertFeatureEnabled(this.prisma, familyId, 'miniGames');
    await this.assertAdult(actorId);
    const p = await this.prisma.publishedMiniGame.findFirst({ where: { id, familyId } });
    if (!p) throw new NotFoundException('Published game not found');
    if (!tiers?.length) throw new BadRequestException('At least one tier is required');
    // Replace wholesale - simpler and safer than diffing, and tiers carry no
    // history of their own (purchases point at the tier ROW, which stays
    // put; only its settings change here, same "editable, doesn't rewrite
    // past history" deal every snapshot-on-write field in this feature has).
    await this.prisma.publishedMiniGameTier.deleteMany({ where: { publishedGameId: id } });
    return this.prisma.publishedMiniGame.update({
      where: { id },
      data: {
        ...(limit?.purchaseLimitCount !== undefined && { purchaseLimitCount: Math.max(1, Math.floor(limit.purchaseLimitCount)) }),
        ...(limit?.purchaseLimitPeriod !== undefined && { purchaseLimitPeriod: this.sanitizePeriod(limit.purchaseLimitPeriod) }),
        tiers: {
          create: tiers.map((t, i) => ({
            label: t.label?.trim() || `Tier ${i + 1}`,
            priceTokens: Math.max(0, Math.floor(t.priceTokens)),
            configJson: this.sanitizeConfig(t.config) as Prisma.InputJsonValue,
            poolJson: this.sanitizePool(t.pool) as unknown as Prisma.InputJsonValue,
            loseTokenValue: Math.max(0, Math.floor(t.loseTokenValue ?? 0)),
            partialCreditEnabled: !!t.partialCreditEnabled,
            partialCreditPerStep: Math.max(0, Math.floor(t.partialCreditPerStep ?? 0)),
            sort: i,
          })),
        },
      },
      include: { tiers: { orderBy: { sort: 'asc' } } },
    });
  }

  async removePublished(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    const p = await this.prisma.publishedMiniGame.findFirst({ where: { id, familyId } });
    if (!p) throw new NotFoundException('Published game not found');
    await this.prisma.publishedMiniGame.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------- Shop (kid buys a play) ----------------

  async purchase(familyId: string, userId: string, tierId: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'miniGames');
    const tier = await this.prisma.publishedMiniGameTier.findFirst({
      where: { id: tierId, publishedGame: { familyId, active: true } },
      include: { publishedGame: { include: { miniGame: true } } },
    });
    if (!tier) throw new NotFoundException('This game is no longer available');
    const buyer = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!buyer) throw new NotFoundException('Family member not found');
    if (buyer.tokensDisabled) throw new ForbiddenException('Tokens are disabled for this account');
    // Rate limit - per user, same cap for everyone, counts any tier under
    // this published game (not just the one being bought right now).
    const since = this.purchaseLimitPeriodStart(tier.publishedGame.purchaseLimitPeriod);
    const usedSoFar = await this.prisma.miniGamePurchase.count({
      where: { userId, createdAt: { gte: since }, tier: { publishedGameId: tier.publishedGameId } },
    });
    if (usedSoFar >= tier.publishedGame.purchaseLimitCount) {
      const periodLabel = tier.publishedGame.purchaseLimitPeriod === 'WEEK' ? 'week' : tier.publishedGame.purchaseLimitPeriod === 'MONTH' ? 'month' : 'day';
      throw new BadRequestException(`Already played "${tier.publishedGame.miniGame.name}" the max ${tier.publishedGame.purchaseLimitCount} time${tier.publishedGame.purchaseLimitCount === 1 ? '' : 's'} this ${periodLabel}`);
    }
    const price = tier.priceTokens;
    if (price > 0) {
      const agg = await this.prisma.tokenLedger.aggregate({ where: { userId }, _sum: { delta: true } });
      const balance = agg._sum.delta ?? 0;
      if (balance < price) throw new BadRequestException(`Not enough tokens - this costs ${price}, balance is ${balance}`);
    }
    // Charged AND drawn immediately, at purchase - decided 2026-09-01. No
    // refund for backing out before Start; see PLANNING.md §18 "Publishing".
    const pool = tier.poolJson as unknown as PoolEntry[];
    const drawnResult = this.draw(pool);
    const purchase = await this.prisma.$transaction(async (tx) => {
      const p = await tx.miniGamePurchase.create({
        data: {
          tierId,
          userId,
          pricePaid: price,
          drawnResultJson: drawnResult as unknown as Prisma.InputJsonValue,
        },
      });
      if (price > 0) {
        await tx.tokenLedger.create({
          data: {
            userId,
            delta: -price,
            reason: `Bought: ${tier.publishedGame.miniGame.name} (${tier.label})`,
            type: 'MINI_GAME_PURCHASE',
            refId: p.id,
            createdById: userId,
          },
        });
      }
      return p;
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return purchase;
  }

  async pendingPurchases(familyId: string, userId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'miniGames'))) return [];
    await this.forfeitStaleInProgress(familyId, userId);
    const purchases = await this.prisma.miniGamePurchase.findMany({
      where: { userId, tier: { publishedGame: { familyId } }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      include: { tier: { include: { publishedGame: { include: { miniGame: { select: { name: true, icon: true, description: true, gameType: true } } } } } } },
    });
    return purchases.map((p) => this.presentPlaySession(p, p.tier.publishedGame.miniGame, p.tier.configJson));
  }

  async startPurchase(familyId: string, userId: string, id: string) {
    return this.startSession('purchase', familyId, userId, id);
  }

  async playPurchase(familyId: string, userId: string, id: string, report: PlayReport) {
    return this.resolvePlay('purchase', familyId, userId, id, report);
  }

  // ---------------- Shared play-session machinery ----------------
  // Grants and purchases go through identical PENDING -> IN_PROGRESS ->
  // PLAYED/FORFEITED plumbing (PLANNING.md §18) - kept here as one
  // parameterized implementation instead of two near-duplicates.

  private table(kind: 'grant' | 'purchase') {
    return kind === 'grant' ? this.prisma.miniGameGrant : this.prisma.miniGamePurchase;
  }

  // `config` is passed explicitly, not read off `row` - a MiniGameGrant
  // carries its own configJson directly, but a MiniGamePurchase doesn't
  // (its settings live on the TIER it bought, not the purchase row itself),
  // so a `'configJson' in row` check silently resolved to undefined for
  // every purchase and crashed the game component that assumed it existed.
  private presentPlaySession(
    row: { id: string; status: string; drawnResultJson: unknown },
    game: { name: string; icon: string | null; description: string | null; gameType: string },
    config: unknown,
  ) {
    return { id: row.id, status: row.status, game, drawnResult: row.drawnResultJson, config };
  }

  // Any row still IN_PROGRESS when the owning kid's queue is fetched again
  // only got there because the tab that started it went away without
  // finishing (closed, refreshed, crashed) - a live session never re-fetches
  // its own row, it already holds that state. Resolve it right here as
  // FORFEITED: no consolation, no partial credit, pre-drawn prize discarded.
  private async forfeitStaleInProgress(familyId: string, userId: string) {
    const grants = await this.prisma.miniGameGrant.findMany({
      where: { userId, miniGame: { familyId }, status: 'IN_PROGRESS' },
    });
    for (const g of grants) {
      await this.prisma.miniGameGrant.update({
        where: { id: g.id },
        data: { status: 'FORFEITED', won: false, tokensAwarded: 0, playedAt: new Date() },
      });
    }
    const purchases = await this.prisma.miniGamePurchase.findMany({
      where: { userId, tier: { publishedGame: { familyId } }, status: 'IN_PROGRESS' },
    });
    for (const p of purchases) {
      await this.prisma.miniGamePurchase.update({
        where: { id: p.id },
        data: { status: 'FORFEITED', won: false, tokensAwarded: 0, playedAt: new Date() },
      });
    }
  }

  private async startSession(kind: 'grant' | 'purchase', familyId: string, userId: string, id: string) {
    await this.forfeitStaleInProgress(familyId, userId);
    const row =
      kind === 'grant'
        ? await this.prisma.miniGameGrant.findFirst({ where: { id, userId, miniGame: { familyId } } })
        : await this.prisma.miniGamePurchase.findFirst({ where: { id, userId, tier: { publishedGame: { familyId } } } });
    if (!row) throw new NotFoundException('Not found');
    if (row.status !== 'PENDING') throw new BadRequestException('Already started');
    const table = this.table(kind) as any;
    return table.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
  }

  private async resolvePlay(kind: 'grant' | 'purchase', familyId: string, userId: string, id: string, report: PlayReport) {
    const row =
      kind === 'grant'
        ? await this.prisma.miniGameGrant.findFirst({
            where: { id, userId, miniGame: { familyId } },
            include: { miniGame: { select: { name: true } } },
          })
        : await this.prisma.miniGamePurchase.findFirst({
            where: { id, userId, tier: { publishedGame: { familyId } } },
            include: { tier: { include: { publishedGame: { include: { miniGame: { select: { name: true } } } } } } },
          });
    if (!row) throw new NotFoundException('Not found');
    if (row.status === 'PLAYED' || row.status === 'FORFEITED') {
      // Already resolved (e.g. a refreshed result screen) - return the same
      // shape a fresh resolution would, so the client can still render it.
      return { won: row.won, tokensAwarded: row.tokensAwarded, prizeWonId: row.prizeWonId, drawnResult: row.drawnResultJson };
    }
    if (row.status !== 'IN_PROGRESS') throw new BadRequestException('Not started');

    const loseTokenValue = kind === 'grant' ? (row as any).loseTokenValue : (row as any).tier.loseTokenValue;
    const partialCreditEnabled = kind === 'grant' ? (row as any).partialCreditEnabled : (row as any).tier.partialCreditEnabled;
    const partialCreditPerStep = kind === 'grant' ? (row as any).partialCreditPerStep : (row as any).tier.partialCreditPerStep;
    const gameName = kind === 'grant' ? (row as any).miniGame.name : (row as any).tier.publishedGame.miniGame.name;
    const drawnResult = row.drawnResultJson as unknown as DrawnResult;

    const won = !!report.won;
    const partialCredit = partialCreditEnabled ? Math.max(0, report.stepsCompleted) * partialCreditPerStep : 0;
    let tokensAwarded = 0;
    let prizeWonId: string | null = null;

    const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true, displayName: true } });
    // Same ledger type either way - MINI_GAME_PURCHASE is only the buy-in
    // debit (see purchase() above); the win/consolation payout itself is
    // MINI_GAME regardless of how the play was obtained.
    const reasonPrefix = kind === 'grant' ? 'Mini-game' : 'Mini-game win';

    if (won) {
      if (drawnResult.kind === 'PRIZE') {
        prizeWonId = drawnResult.prizeId;
        const prize = await this.prisma.prize.findUnique({ where: { id: drawnResult.prizeId } });
        if (prize) {
          await this.prisma.redemption.create({ data: { prizeId: drawnResult.prizeId, userId, status: 'FULFILLED', source: 'GAME' } });
          await this.notifications.notifyAdults(
            familyId,
            'GAME_PRIZE_WON',
            `🎁 ${buyer?.displayName ?? 'Someone'} won "${prize.name}" from ${gameName} - get it ready for them!`,
            { link: '/store', excludeUserId: userId, subjectUserId: userId },
          );
        }
      } else if (drawnResult.kind === 'STREAK_FREEZE') {
        await this.streakFreeze.grant(userId, drawnResult.amount, { reason: `${reasonPrefix}: ${gameName}`, createdById: userId, refId: id, type: 'GAME' });
      } else {
        tokensAwarded = drawnResult.amount;
      }
    } else {
      tokensAwarded = loseTokenValue + partialCredit;
    }

    if (tokensAwarded > 0 && !buyer?.tokensDisabled) {
      await this.prisma.tokenLedger.create({
        data: { userId, delta: tokensAwarded, reason: `${reasonPrefix}: ${gameName}`, type: 'MINI_GAME', refId: id, createdById: userId },
      });
    }

    const table = this.table(kind) as any;
    await table.update({
      where: { id },
      data: {
        status: 'PLAYED',
        won,
        stepsCompleted: report.stepsCompleted,
        totalSteps: report.totalSteps,
        timeTakenSeconds: Math.max(0, Math.floor(report.timeTakenSeconds)),
        tokensAwarded,
        prizeWonId,
        playedAt: new Date(),
      },
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { won, tokensAwarded, prizeWonId, drawnResult };
  }
}
