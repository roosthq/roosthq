import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface RuleInput {
  text: string;
  targetUserId?: string | null; // null/omitted = shared, visible to every kid
}

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !this.isAdult(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  private async owned(familyId: string, id: string) {
    const r = await this.prisma.rule.findFirst({ where: { id, familyId } });
    if (!r) throw new NotFoundException('Rule not found');
    return r;
  }

  // Adults see every rule (grouped by who it's for, in the UI); kids see the
  // shared ones plus whatever's specifically theirs - not other kids' rules.
  async list(familyId: string, actingUserId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    const adult = !!actor && this.isAdult(actor.role);
    const rules = await this.prisma.rule.findMany({
      where: {
        familyId,
        ...(adult ? {} : { OR: [{ targetUserId: null }, { targetUserId: actingUserId }] }),
      },
      orderBy: { createdAt: 'asc' },
      include: { targetUser: { select: { id: true, displayName: true } } },
    });
    return rules.map((r) => ({
      id: r.id,
      text: r.text,
      targetUserId: r.targetUserId,
      targetUserName: r.targetUser?.displayName ?? null,
      createdAt: r.createdAt,
    }));
  }

  async create(familyId: string, actorId: string, dto: RuleInput) {
    await this.assertAdult(actorId);
    return this.prisma.rule.create({
      data: { familyId, text: dto.text, targetUserId: dto.targetUserId || null, createdById: actorId },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<RuleInput>) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    return this.prisma.rule.update({
      where: { id },
      data: {
        ...(dto.text !== undefined && { text: dto.text }),
        ...(dto.targetUserId !== undefined && { targetUserId: dto.targetUserId || null }),
      },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    await this.prisma.rule.delete({ where: { id } });
    return { ok: true };
  }
}
