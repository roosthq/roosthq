import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';

type Role = 'OWNER' | 'ADULT' | 'KID';

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
  }

  // Create a one-time invite; returns the raw token once (for the link).
  async create(familyId: string, userId: string, role: Role, label?: string) {
    await this.assertOwner(userId);
    const raw = randomBytes(24).toString('hex');
    const inv = await this.prisma.familyInvite.create({
      data: { familyId, role, label, tokenHash: this.hash(raw), createdById: userId },
    });
    return { id: inv.id, role: inv.role, label: inv.label, token: raw };
  }

  async list(familyId: string) {
    const invs = await this.prisma.familyInvite.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
    });
    return invs.map((i) => ({
      id: i.id,
      role: i.role,
      label: i.label,
      createdAt: i.createdAt,
      acceptedAt: i.acceptedAt,
    }));
  }

  async revoke(familyId: string, userId: string, id: string) {
    await this.assertOwner(userId);
    await this.prisma.familyInvite.deleteMany({ where: { id, familyId } });
    return { ok: true };
  }

  // Used by the auth callback: resolve a raw token to a live, unused invite.
  async resolve(raw: string) {
    const inv = await this.prisma.familyInvite.findFirst({
      where: { tokenHash: this.hash(raw), acceptedAt: null },
    });
    if (!inv) return null;
    if (inv.expiresAt && inv.expiresAt < new Date()) return null;
    return inv;
  }

  async markAccepted(id: string) {
    await this.prisma.familyInvite.update({ where: { id }, data: { acceptedAt: new Date() } });
  }
}
