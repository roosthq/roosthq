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

  private emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private inviteEmailBody(actorName: string, familyName: string, url: string): string {
    return [
      `${actorName} invited you to join ${familyName} on Roost HQ.`,
      '',
      'Open this link to accept, then sign in to join:',
      url,
      '',
      'The link works once and only for you. If you were not expecting this, you can ignore it.',
    ].join('\n');
  }

  // Create a one-time invite; returns the raw token once (for the link).
  // Adults can invite new kids/adults; owner/family manager can additionally
  // invite a family manager; only the instance owner can invite another owner.
  // targetFamilyId lets the instance owner invite someone into a family other
  // than their own (e.g. a brand-new family they just created) - ignored for
  // anyone else, who can only ever invite into their own family.
  //
  // email + baseUrl (both optional): when an email is given, this sends the
  // invite in the SAME call instead of making "type an email, send it" a
  // second step after "generate a link" - typing an address and picking a
  // role is the whole point of an email invite, not an afterthought once a
  // link already exists. baseUrl is only needed when email is - it's still
  // the request's own origin (passed in by the controller), never anything
  // client-supplied, same trust rule as the old standalone emailInvite().
  // Leaving email blank is the "just generate a link to share myself" path.
  async create(
    familyId: string,
    userId: string,
    role: Role,
    opts: { label?: string; targetFamilyId?: string; email?: string; baseUrl?: string } = {},
  ) {
    const actor = await this.assertAdultOrOwner(userId);
    if (role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can invite another owner');
    }
    if (role === 'FAMILY_MANAGER' && actor.role !== 'OWNER' && actor.role !== 'FAMILY_MANAGER') {
      throw new ForbiddenException('Only the owner or a family manager can invite another family manager');
    }
    let destFamilyId = familyId;
    if (opts.targetFamilyId && opts.targetFamilyId !== familyId) {
      if (actor.role !== 'OWNER') throw new ForbiddenException('Only the owner can invite into a different family');
      const family = await this.prisma.family.findUnique({ where: { id: opts.targetFamilyId } });
      if (!family) throw new NotFoundException('Family not found');
      destFamilyId = opts.targetFamilyId;
    }

    const address = opts.email?.trim();
    if (address) {
      if (!this.emailAddressPattern.test(address)) throw new BadRequestException('That does not look like an email address');
      if (!this.email.enabled) {
        throw new BadRequestException('Email is not set up on this server yet - leave the address blank and copy the link instead.');
      }
    }

    const raw = randomBytes(24).toString('hex');
    const inv = await this.prisma.familyInvite.create({
      data: { familyId: destFamilyId, role, label: opts.label, email: address || null, tokenHash: this.hash(raw), createdById: userId },
    });

    let sentTo: string | undefined;
    if (address) {
      const family = await this.prisma.family.findUnique({ where: { id: destFamilyId }, select: { name: true } });
      const url = `${(opts.baseUrl ?? '').replace(/\/+$/, '')}/?invite=${raw}`;
      await this.email.send(address, `${actor.displayName} invited you to Roost HQ`, this.inviteEmailBody(actor.displayName, family?.name ?? 'their family', url));
      sentTo = address;
    }
    return { id: inv.id, role: inv.role, label: inv.label, email: inv.email, token: raw, sentTo };
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
      email: i.email,
      createdAt: i.createdAt,
      acceptedAt: i.acceptedAt,
      expiresAt: i.expiresAt,
    }));
  }

  // Resend to whatever address is already on file for this pending invite -
  // no retyping. Still works for a fresh address too (e.g. resending
  // somewhere else), same validation as create()'s inline send.
  async resend(familyId: string, userId: string, id: string, baseUrl: string, toOverride?: string) {
    const actor = await this.assertAdultOrOwner(userId);
    const inv = await this.prisma.familyInvite.findFirst({ where: { id, familyId, acceptedAt: null } });
    if (!inv) throw new NotFoundException('Invite not found (or already accepted)');
    const address = (toOverride?.trim() || inv.email || '').trim();
    if (!this.emailAddressPattern.test(address)) throw new BadRequestException('That does not look like an email address');
    if (!this.email.enabled) {
      throw new BadRequestException('Email is not set up on this server yet - copy the link and send it yourself.');
    }
    // Only the hash is ever stored - resending the SAME link isn't possible,
    // so this mints a fresh token (same role/label/email) and revokes the
    // old one, same pattern regenerate() already uses for "get link" again.
    await this.prisma.familyInvite.delete({ where: { id } });
    const raw = randomBytes(24).toString('hex');
    const created = await this.prisma.familyInvite.create({
      data: { familyId, role: inv.role, label: inv.label, email: address, tokenHash: this.hash(raw), createdById: userId },
    });
    const family = await this.prisma.family.findUnique({ where: { id: familyId }, select: { name: true } });
    const url = `${baseUrl.replace(/\/+$/, '')}/?invite=${raw}`;
    await this.email.send(address, `${actor.displayName} invited you to Roost HQ`, this.inviteEmailBody(actor.displayName, family?.name ?? 'their family', url));
    return { id: created.id, role: created.role, label: created.label, email: created.email, token: raw, sentTo: address };
  }

  async revoke(familyId: string, userId: string, id: string) {
    await this.assertAdultOrOwner(userId);
    await this.prisma.familyInvite.deleteMany({ where: { id, familyId } });
    return { ok: true };
  }

  // Only the hash is ever stored, so a lost/expired-from-view link can't be
  // recovered - this mints a fresh one with the same role/label and revokes
  // the old, same net effect as "show me that link again" without ever
  // keeping a usable token sitting in the database.
  async regenerate(familyId: string, userId: string, id: string) {
    await this.assertAdultOrOwner(userId);
    const existing = await this.prisma.familyInvite.findFirst({ where: { id, familyId, acceptedAt: null } });
    if (!existing) throw new NotFoundException('Invite not found (or already accepted)');
    await this.prisma.familyInvite.delete({ where: { id } });
    const raw = randomBytes(24).toString('hex');
    const inv = await this.prisma.familyInvite.create({
      data: { familyId, role: existing.role, label: existing.label, email: existing.email, tokenHash: this.hash(raw), createdById: userId },
    });
    return { id: inv.id, role: inv.role, label: inv.label, email: inv.email, token: raw };
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
