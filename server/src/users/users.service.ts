import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashPin } from '../crypto/pin';

type Role = 'OWNER' | 'ADULT' | 'KID';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list(familyId: string) {
    const users = await this.prisma.user.findMany({
      where: { familyId },
      select: { id: true, displayName: true, role: true, avatar: true, pinHash: true },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      avatar: u.avatar,
      hasPin: !!u.pinHash,
    }));
  }

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'ADULT')) {
      throw new ForbiddenException('Adults only');
    }
    return u;
  }

  // Set or clear a member's PIN (pin=null clears). Adults/owner can manage PINs.
  async setPin(actorId: string, familyId: string, targetId: string, pin: string | null) {
    await this.assertAdult(actorId);
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    await this.prisma.user.update({
      where: { id: targetId },
      data: { pinHash: pin ? hashPin(pin) : null },
    });
    return { ok: true };
  }

  // Only the owner can change roles (e.g. mark a newly-added member as a KID).
  async setRole(actorId: string, familyId: string, targetId: string, role: Role) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.role !== 'OWNER') throw new ForbiddenException('Owner only');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    await this.prisma.user.update({ where: { id: targetId }, data: { role } });
    return { ok: true };
  }

  // Current user's own app theme preference.
  async setTheme(userId: string, theme: 'light' | 'dark') {
    const t = theme === 'dark' ? 'dark' : 'light';
    await this.prisma.user.update({ where: { id: userId }, data: { themePref: t } });
    return { ok: true, theme: t };
  }

  // Owner removes a member. Cleans up rows that would otherwise block the delete
  // (chores reference users without cascade). Can't remove yourself or the owner.
  async remove(actorId: string, familyId: string, targetId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.role !== 'OWNER') throw new ForbiddenException('Owner only');
    if (actorId === targetId) throw new ForbiddenException('You cannot remove yourself');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot remove the owner');

    await this.prisma.$transaction([
      // Chores assigned to or created by this member (cascades to instances/checklist).
      this.prisma.chore.deleteMany({
        where: { OR: [{ assigneeUserId: targetId }, { createdById: targetId }] },
      }),
      // Ledger entries authored by or crediting this member.
      this.prisma.tokenLedger.deleteMany({
        where: { OR: [{ userId: targetId }, { createdById: targetId }] },
      }),
      // The user (cascades google accounts, calendar shares, locations, redemptions).
      this.prisma.user.delete({ where: { id: targetId } }),
    ]);
    return { ok: true };
  }
}
