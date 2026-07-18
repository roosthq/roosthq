import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface AwardInput {
  name: string;
  icon?: string | null;
  description?: string | null;
}

export interface GrantInput {
  userId: string;
  note?: string;
}

@Injectable()
export class AwardsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'ADULT';
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
      grantCount: a._count.grants,
    }));
  }

  async create(familyId: string, actorId: string, dto: AwardInput) {
    await this.assertAdult(actorId);
    return this.prisma.award.create({
      data: { familyId, name: dto.name, icon: dto.icon || null, description: dto.description || null, createdById: actorId },
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

  async grant(familyId: string, actorId: string, awardId: string, dto: GrantInput) {
    const actor = await this.assertAdult(actorId);
    const award = await this.owned(familyId, awardId);
    const recipient = await this.prisma.user.findFirst({ where: { id: dto.userId, familyId } });
    if (!recipient) throw new NotFoundException('Family member not found');
    const grant = await this.prisma.awardGrant.create({
      data: { awardId: award.id, userId: dto.userId, grantedById: actorId, note: dto.note || null },
    });
    await this.notifications.create(
      familyId,
      dto.userId,
      'AWARD_GRANTED',
      `${actor.displayName} gave you the "${award.name}" award!`,
      { link: '/profile' },
    );
    return grant;
  }
}
