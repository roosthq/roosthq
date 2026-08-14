import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';
import { assertFeatureEnabled, isFeatureEnabled } from '../common/features';
import { paginate } from '../common/pagination';

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
    if (!(await isFeatureEnabled(this.prisma, familyId, 'tokens'))) return { userId, balance: 0 };
    const member = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const agg = await this.prisma.tokenLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return { userId, balance: agg._sum.delta ?? 0 };
  }

  // Balances for the whole family.
  async balances(familyId: string) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'tokens'))) return [];
    const grouped = await this.prisma.tokenLedger.groupBy({
      by: ['userId'],
      _sum: { delta: true },
      where: { user: { familyId } },
    });
    return grouped.map((g) => ({ userId: g.userId, balance: g._sum.delta ?? 0 }));
  }

  // Full transaction history for a member (earning + spending). Who created
  // each entry (an adult's manual adjustment, an approval, an award) is
  // adult-only context - a kid sees the same entries minus that one field.
  async ledger(familyId: string, actingUserId: string, targetUserId: string, skip = 0, take = 50) {
    if (!(await isFeatureEnabled(this.prisma, familyId, 'tokens'))) return { items: [], hasMore: false };
    const member = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    const isAdult = !!actor && ['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role);
    const entries = await this.prisma.tokenLedger.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
      include: { createdBy: { select: { displayName: true } } },
    });
    const { items, hasMore } = paginate(entries, take);
    return {
      items: items.map((e) => ({
        id: e.id,
        delta: e.delta,
        reason: e.reason,
        type: e.type,
        refId: e.refId,
        createdAt: e.createdAt,
        createdByName: isAdult ? e.createdBy.displayName : undefined,
      })),
      hasMore,
    };
  }

  // Everything that's happened TO or been done BY this person, one merged
  // timeline instead of four separate lists (tokens, awards, purchases,
  // streak freezes) nobody could see "what happened when" across. Each
  // source is fetched down to the SAME depth (skip+take+1) it would need if
  // it alone accounted for every row that deep - correct however far back
  // you page, since a row ranked <= N overall must rank <= N within its own
  // source too. Slightly over-fetches on deep pages; fine at this scale.
  async activity(familyId: string, actingUserId: string, targetUserId: string, skip = 0, take = 50) {
    const member = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    const isAdult = !!actor && ['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role);
    const depth = skip + take + 1;

    type Row = {
      id: string;
      kind: string;
      label: string;
      detail?: string | null;
      icon?: string | null;
      amount?: number;
      amountUnit?: 'TOKENS' | 'FREEZE';
      createdAt: Date;
      createdByName?: string;
    };
    const rows: Row[] = [];

    const [tokenEntries, awardGrants, redemptions, freezeEntries, freezeNotifs] = await Promise.all([
      this.prisma.tokenLedger.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: depth,
        include: { createdBy: { select: { displayName: true } } },
      }),
      this.prisma.awardGrant.findMany({
        where: { userId: targetUserId, award: { familyId } },
        orderBy: { createdAt: 'desc' },
        take: depth,
        include: { award: { select: { name: true, icon: true } }, grantedBy: { select: { displayName: true } } },
      }),
      this.prisma.redemption.findMany({
        where: { userId: targetUserId, prize: { familyId } },
        orderBy: { requestedAt: 'desc' },
        take: depth,
        include: { prize: { select: { name: true } }, approvedByUser: { select: { displayName: true } } },
      }),
      this.prisma.streakFreezeLedger.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: depth,
        include: { createdBy: { select: { displayName: true } } },
      }),
      // The per-chore bank's own earn/use events (see chores.service.ts) have
      // no ledger of their own - notification is the only durable record.
      // '🧊 ' prefix is deliberate and stable (see markMissedAndAdvance/
      // approveInstance) so this stays a reliable filter, not string luck.
      this.prisma.notification.findMany({
        where: { userId: targetUserId, title: { startsWith: '🧊 ' } },
        orderBy: { createdAt: 'desc' },
        take: depth,
      }),
    ]);

    for (const e of tokenEntries) {
      rows.push({
        id: `token:${e.id}`,
        kind: `TOKEN_${e.type}`,
        label: e.reason,
        amount: e.delta,
        amountUnit: 'TOKENS',
        createdAt: e.createdAt,
        createdByName: isAdult ? e.createdBy.displayName : undefined,
      });
    }
    for (const g of awardGrants) {
      rows.push({
        id: `award:${g.id}`,
        kind: 'AWARD_BADGE',
        label: `Earned award: ${g.award.name}`,
        detail: g.note,
        icon: g.award.icon,
        createdAt: g.createdAt,
        createdByName: g.grantedBy.displayName,
      });
    }
    for (const r of redemptions) {
      rows.push({
        id: `redemption:${r.id}`,
        kind: 'REDEMPTION',
        label: `Bought: ${r.prize.name}`,
        detail: r.approvedByUser ? `${r.status.toLowerCase()} by ${r.approvedByUser.displayName}` : r.status.toLowerCase(),
        createdAt: r.requestedAt,
      });
    }
    for (const f of freezeEntries) {
      rows.push({
        id: `freeze:${f.id}`,
        kind: `FREEZE_${f.type}`,
        label: f.reason,
        amount: f.delta,
        amountUnit: 'FREEZE',
        createdAt: f.createdAt,
        createdByName: isAdult ? f.createdBy.displayName : undefined,
      });
    }
    for (const n of freezeNotifs) {
      rows.push({
        id: `freezenotif:${n.id}`,
        kind: 'FREEZE_CHORE_AUTO',
        label: n.title.replace(/^🧊 /, ''),
        createdAt: n.createdAt,
      });
    }

    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const window = rows.slice(skip, skip + take + 1);
    const hasMore = window.length > take;
    return { items: window.slice(0, take), hasMore };
  }

  // Owner-only: strike a specific history entry entirely (not a reversing
  // entry like an award removal - this actually deletes the row, and since
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
    await assertFeatureEnabled(this.prisma, familyId, 'tokens');
    await this.assertAdult(actorId);
    if (!Number.isInteger(delta) || delta === 0) throw new BadRequestException('delta must be a non-zero integer');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    const member = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!member) throw new NotFoundException('Member not found');
    // Loud, not a silent no-op - a manual give/take is a deliberate adult
    // action; better to say why nothing happened than leave them wondering
    // where the tokens went.
    if (member.tokensDisabled) throw new BadRequestException(`${member.displayName} has tokens turned off`);
    const entry = await this.prisma.tokenLedger.create({
      data: { userId, delta, reason: reason.trim(), type, createdById: actorId },
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return entry;
  }

  // Distinct reasons an adult has actually typed before for a manual
  // give/take, most-used first - lets the quick-adjust modal offer real
  // family history instead of only generic presets. Scoped to
  // MANUAL/PHYSICAL entries only: chore/award/redeem reasons are
  // system-generated text, not something anyone picked from a list.
  async commonReasons(familyId: string, actorId: string, limit = 8): Promise<string[]> {
    await this.assertAdult(actorId);
    const grouped = await this.prisma.tokenLedger.groupBy({
      by: ['reason'],
      _count: { reason: true },
      where: { type: { in: ['MANUAL', 'PHYSICAL'] }, user: { familyId } },
      orderBy: { _count: { reason: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => g.reason);
  }
}
