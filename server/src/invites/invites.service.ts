import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../notifications/email.service';

type Role = 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async assertAdultOrOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  // Create a one-time invite; returns the raw token once (for the link).
  // Adults can invite new kids/adults; owner/family manager can additionally
  // invite a family manager; only the instance owner can invite another owner.
  // targetFamilyId lets the instance owner invite someone into a family other
  // than their own (e.g. a brand-new family they just created) — ignored for
  // anyone else, who can only ever invite into their own family.
  async create(familyId: string, userId: string, role: Role, label?: string, targetFamilyId?: string) {
    const actor = await this.assertAdultOrOwner(userId);
    if (role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can invite another owner');
    }
    if (role === 'FAMILY_MANAGER' && actor.role !== 'OWNER' && actor.role !== 'FAMILY_MANAGER') {
      throw new ForbiddenException('Only the owner or a family manager can invite another family manager');
    }
    let destFamilyId = familyId;
    if (targetFamilyId && targetFamilyId !== familyId) {
      if (actor.role !== 'OWNER') throw new ForbiddenException('Only the owner can invite into a different family');
      const family = await this.prisma.family.findUnique({ where: { id: targetFamilyId } });
      if (!family) throw new NotFoundException('Family not found');
      destFamilyId = targetFamilyId;
    }
    const raw = randomBytes(24).toString('hex');
    const inv = await this.prisma.familyInvite.create({
      data: { familyId: destFamilyId, role, label, tokenHash: this.hash(raw), createdById: userId },
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

  // Mail an already-minted invite link to whoever it's for. The link is built
  // from the request's own origin (passed in by the controller), never from a
  // client-supplied URL, so nothing arbitrary ends up in an outbound email.
  async emailInvite(familyId: string, userId: string, token: string, to: string, baseUrl: string) {
    const actor = await this.assertAdultOrOwner(userId);
    const address = (to || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new BadRequestException('That does not look like an email address');
    if (!this.email.enabled) {
      throw new BadRequestException('Email is not set up on this server yet — copy the link and send it yourself.');
    }
    const inv = await this.resolve(token);
    if (!inv) throw new NotFoundException('That invite has expired or already been used');
    // Same scoping rule as create(): your own family, unless you're the owner.
    if (inv.familyId !== familyId && actor.role !== 'OWNER') throw new ForbiddenException('Not your invite');
    const family = await this.prisma.family.findUnique({ where: { id: inv.familyId }, select: { name: true } });
    const url = `${baseUrl.replace(/\/+$/, '')}/?invite=${token}`;
    const body = [
      `${actor.displayName} invited you to join ${family?.name ?? 'their family'} on Roost HQ.`,
      '',
      'Open this link to accept, then sign in to join:',
      url,
      '',
      'The link works once and only for you. If you were not expecting this, you can ignore it.',
    ].join('\n');
    await this.email.send(address, `${actor.displayName} invited you to Roost HQ`, body);
    return { ok: true, sentTo: address };
  }

  async revoke(familyId: string, userId: string, id: string) {
    await this.assertAdultOrOwner(userId);
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
