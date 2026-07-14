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
}
