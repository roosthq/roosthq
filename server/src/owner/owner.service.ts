import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Instance-level powers, deliberately gated on the literal OWNER role (not
// FAMILY_MANAGER) — multi-family management and ghosting reach across every
// family in the instance, not just one, so they stay narrower than the
// per-family role split added alongside this.
@Injectable()
export class OwnerService {
  constructor(private prisma: PrismaService) {}

  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
    return u;
  }

  async listFamilies(actorId: string) {
    await this.assertOwner(actorId);
    const families = await this.prisma.family.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return families.map((f) => ({ id: f.id, name: f.name, memberCount: f._count.users, createdAt: f.createdAt }));
  }

  async createFamily(actorId: string, name: string) {
    await this.assertOwner(actorId);
    if (!name?.trim()) throw new BadRequestException('Name is required');
    const family = await this.prisma.family.create({ data: { name: name.trim() } });
    return { id: family.id, name: family.name, memberCount: 0, createdAt: family.createdAt };
  }

  async familyMembers(actorId: string, familyId: string) {
    await this.assertOwner(actorId);
    return this.prisma.user.findMany({
      where: { familyId },
      select: { id: true, displayName: true, role: true, avatar: true, email: true },
      orderBy: { displayName: 'asc' },
    });
  }

  // Move an existing member into a different family, assigning their role
  // there. Location/calendar shares are family-scoped and don't carry any
  // meaning in the destination family, so they're dropped; chore assignments
  // to chores outside the new family are dropped the same way (the chore
  // itself is untouched — just this one now-cross-family assignment).
  async moveUser(actorId: string, targetUserId: string, familyId: string, role: 'FAMILY_MANAGER' | 'ADULT' | 'KID') {
    await this.assertOwner(actorId);
    const family = await this.prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new NotFoundException('Family not found');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('The owner cannot be moved between families');

    await this.prisma.$transaction([
      this.prisma.userLocation.deleteMany({ where: { userId: targetUserId } }),
      this.prisma.calendarShare.deleteMany({ where: { userId: targetUserId } }),
      this.prisma.choreAssignee.deleteMany({
        where: { userId: targetUserId, chore: { familyId: { not: familyId } } },
      }),
      this.prisma.user.update({ where: { id: targetUserId }, data: { familyId, role } }),
    ]);
    return { ok: true };
  }

  // Mint a session acting as `targetUserId`, stamping who's really behind it
  // so the UI can show a "Ghosting as X" banner and offer a way back. Doubles
  // as "switch family" (pick any member of another family) and "ghost into a
  // specific account" (pick a kid vs an adult) — same mechanism either way.
  async ghost(actorId: string, targetUserId: string) {
    await this.assertOwner(actorId);
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');
    return { userId: target.id, familyId: target.familyId, ghostedBy: actorId };
  }

  // Rebuild the real owner's own session from the ghostedBy id stamped into
  // the current one — re-checked against the DB (role could theoretically
  // have changed mid-ghost) rather than trusted blindly from the token.
  async unghost(ghostedBy: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ghostedBy } });
    if (!owner || owner.role !== 'OWNER') throw new ForbiddenException('Not a valid owner session');
    return { userId: owner.id, familyId: owner.familyId };
  }
}
