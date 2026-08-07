import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DisplayEventsService } from '../display/display-events.service';

export interface AwardInput {
  name: string;
  icon?: string | null;
  description?: string | null;
  defaultTokenValue?: number;
}

export interface GrantInput {
  userId: string;
  note?: string;
  tokenValue?: number;
}

@Injectable()
export class AwardsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
  ) {}

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

  // The full catalog — adults only, since a kid seeing this would spoil the
  // surprise of anything not yet given to them.
  async catalog(familyId: string, actorId: string) {
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
      grantCount: a._count.grants,
    }));
  }

  async create(familyId: string, actorId: string, dto: AwardInput) {
    await this.assertAdult(actorId);
    return this.prisma.award.create({
      data: {
        familyId,
        name: dto.name,
        icon: dto.icon || null,
        description: dto.description || null,
        defaultTokenValue: Math.max(0, Math.floor(dto.defaultTokenValue ?? 0)),
        createdById: actorId,
      },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<AwardInput>) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    return this.prisma.award.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.icon !== undefined && { icon: dto.icon || null }),
        ...(dto.description !== undefined && { description: dto.description || null }),
        ...(dto.defaultTokenValue !== undefined && { defaultTokenValue: Math.max(0, Math.floor(dto.defaultTokenValue)) }),
      },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    await this.prisma.award.delete({ where: { id } });
    return { ok: true };
  }

  // What a kid has actually been given — only award types with >=1 grant to
  // them, each with how many times. This is the one award-related view a kid
  // (or anyone looking at their own profile) is allowed to see.
  async earned(familyId: string, actingUserId: string, targetUserId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actor) throw new ForbiddenException();
    if (!this.isAdult(actor.role) && actingUserId !== targetUserId) {
      throw new ForbiddenException("Can't see someone else's awards");
    }
    const grants = await this.prisma.awardGrant.findMany({
      where: { userId: targetUserId, award: { familyId } },
      include: { award: true },
    });
    const byAward = new Map<string, { id: string; name: string; icon: string | null; description: string | null; count: number }>();
    for (const g of grants) {
      const existing = byAward.get(g.awardId);
      if (existing) existing.count += 1;
      else byAward.set(g.awardId, { id: g.award.id, name: g.award.name, icon: g.award.icon, description: g.award.description, count: 1 });
    }
    return [...byAward.values()];
  }

  // Adults-only, family-wide grant history — who gave what to whom, the note,
  // the token value actually given, and when. Newest first.
  async history(familyId: string, actorId: string) {
    await this.assertAdult(actorId);
    const grants = await this.prisma.awardGrant.findMany({
      where: { award: { familyId } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        award: { select: { id: true, name: true, icon: true } },
        user: { select: { id: true, displayName: true } },
        grantedBy: { select: { id: true, displayName: true } },
      },
    });
    return grants.map((g) => ({
      id: g.id,
      award: g.award,
      user: g.user,
      grantedBy: g.grantedBy,
      note: g.note,
      tokenValue: g.tokenValue,
      createdAt: g.createdAt,
    }));
  }

  async grant(familyId: string, actorId: string, awardId: string, dto: GrantInput) {
    const actor = await this.assertAdult(actorId);
    const award = await this.owned(familyId, awardId);
    const recipient = await this.prisma.user.findFirst({ where: { id: dto.userId, familyId } });
    if (!recipient) throw new NotFoundException('Family member not found');
    const tokenValue = Math.max(0, Math.floor(dto.tokenValue ?? award.defaultTokenValue));
    const grant = await this.prisma.awardGrant.create({
      data: { awardId: award.id, userId: dto.userId, grantedById: actorId, note: dto.note || null, tokenValue },
    });
    // The trophy/badge (AwardGrant) always records the award, same as a
    // chore always completes regardless — this only gates the ledger entry.
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
    await this.notifications.create(
      familyId,
      dto.userId,
      'AWARD_GRANTED',
      `${actor.displayName} gave you the "${award.name}" award!`,
      { link: '/profile' },
    );
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return grant;
  }

  // Undo a specific grant: removes the badge (so it no longer counts toward
  // "earned") and reverses its tokens with a new negative ledger entry rather
  // than deleting the original — same audit-trail convention as a rejected
  // redemption refund elsewhere in this app.
  async removeGrant(familyId: string, actorId: string, grantId: string) {
    await this.assertAdult(actorId);
    const grant = await this.prisma.awardGrant.findFirst({
      where: { id: grantId, award: { familyId } },
      include: { award: true },
    });
    if (!grant) throw new NotFoundException('Award grant not found');
    const recipient = await this.prisma.user.findUnique({ where: { id: grant.userId }, select: { tokensDisabled: true } });
    // Mirrors grant()'s own gate — if tokens were disabled (still are), no
    // forward entry exists to reverse; writing one anyway would be a
    // phantom negative entry with nothing to offset.
    if (grant.tokenValue > 0 && !recipient?.tokensDisabled) {
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
    await this.prisma.awardGrant.delete({ where: { id: grantId } });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { ok: true };
  }
}
