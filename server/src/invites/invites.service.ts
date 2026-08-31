import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../notifications/email.service';
import { emailHtml, escapeHtml } from '../notifications/email-template';
import { encrypt, decrypt } from '../crypto/token-crypto';

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

  private inviteEmailText(actorName: string, familyName: string, url: string): string {
    return [
      `${actorName} invited you to join ${familyName} on Roost HQ.`,
      '',
      'Open this link to accept, then sign in to join:',
      url,
      '',
      'The link works once and only for you. If you were not expecting this, you can ignore it.',
    ].join('\n');
  }

  private inviteEmailHtml(actorName: string, familyName: string, url: string, baseUrl: string): string {
    return emailHtml({
      webUrl: baseUrl,
      heading: "You're invited!",
      bodyHtml: `<p style="margin:0;">
        <strong>${escapeHtml(actorName)}</strong> invited you to join <strong>${escapeHtml(familyName)}</strong> on Roost HQ - a shared calendar, chores, and rewards hub for the family.
      </p>`,
      buttonText: 'Accept invite',
      buttonUrl: url,
      footnote: "This link works once, just for you. If you weren't expecting this, you can ignore it.",
    });
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
      data: {
        familyId: destFamilyId,
        role,
        label: opts.label,
        email: address || null,
        tokenHash: this.hash(raw),
        tokenEncrypted: encrypt(raw),
        createdById: userId,
      },
    });

    let sentTo: string | undefined;
    if (address) {
      const family = await this.prisma.family.findUnique({ where: { id: destFamilyId }, select: { name: true } });
      const baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '');
      const url = `${baseUrl}/?invite=${raw}`;
      const familyName = family?.name ?? 'their family';
      await this.email.send(
        address,
        `${actor.displayName} invited you to Roost HQ`,
        this.inviteEmailText(actor.displayName, familyName, url),
        this.inviteEmailHtml(actor.displayName, familyName, url, baseUrl),
      );
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

  // Owner-only: any family's invites, not just the caller's own - the
  // instance-wide Families panel needs to show pending/sent invites for a
  // family that isn't the owner's own home family (the same cross-family
  // reach create()/resend()/regenerate()/revoke() already have). list()
  // above stays scoped to the caller's own family for everyone else
  // (MembersManager, the only other caller).
  async listForFamily(actorId: string, familyId: string) {
    const actor = await this.assertAdultOrOwner(actorId);
    if (actor.role !== 'OWNER') throw new ForbiddenException('Owner only');
    return this.list(familyId);
  }

  // Resend to whatever address is already on file for this pending invite -
  // no retyping. Still works for a fresh address too (e.g. resending
  // somewhere else), same validation as create()'s inline send.
  //
  // Re-sends the SAME link (decrypts tokenEncrypted, doesn't rotate) - it
  // used to mint a fresh token and delete the old row every time, which
  // meant a resend silently broke the ORIGINAL email: someone who found the
  // first one late (spam folder) and clicked it after a resend got "invite
  // not found (or already accepted)" - true of the token they were holding,
  // but confusing and wrong-feeling since nothing about THEM had actually
  // changed. A resend is "say it again," not "start over" - regenerate()
  // below is the actual "give me a genuinely new link" action, and still
  // rotates, on purpose.
  //
  // A pre-existing invite from before tokenEncrypted existed (tokenEncrypted
  // null) has no raw token left to recover - the very first send was the
  // only time that link ever existed - so THAT one still has to rotate, same
  // as always. Every invite created (or resent) after this ships carries an
  // encrypted copy and never needs to again.
  //
  // familyId is the ACTOR's own family, not necessarily the invite's - an
  // owner can invite into a family other than their own (see create()'s
  // targetFamilyId), and this used to filter the lookup by the actor's
  // family regardless, so an owner emailing an invite to a brand-new family
  // they'd just created got a false "Invite not found" 404 every time (the
  // invite's real familyId never matched their own). An owner bypasses the
  // family filter entirely here, same as their create()/moveUser() reach;
  // anyone else stays scoped to their own family only.
  async resend(familyId: string, userId: string, id: string, baseUrl: string, toOverride?: string) {
    const actor = await this.assertAdultOrOwner(userId);
    const inv = await this.prisma.familyInvite.findFirst({
      where: { id, acceptedAt: null, ...(actor.role === 'OWNER' ? {} : { familyId }) },
    });
    if (!inv) throw new NotFoundException('Invite not found (or already accepted)');
    const address = (toOverride?.trim() || inv.email || '').trim();
    if (!this.emailAddressPattern.test(address)) throw new BadRequestException('That does not look like an email address');
    if (!this.email.enabled) {
      throw new BadRequestException('Email is not set up on this server yet - copy the link and send it yourself.');
    }

    let result: { id: string; role: Role; label: string | null; email: string | null };
    let raw: string;
    if (inv.tokenEncrypted) {
      // Same row, same token - just keep the on-file address current if a
      // different one was typed in for this resend.
      const updated = await this.prisma.familyInvite.update({ where: { id }, data: { email: address } });
      raw = decrypt(inv.tokenEncrypted);
      result = { id: updated.id, role: updated.role, label: updated.label, email: updated.email };
    } else {
      // Legacy row, no recoverable token - one last rotation; every invite
      // from here on carries tokenEncrypted and never needs this branch.
      await this.prisma.familyInvite.delete({ where: { id } });
      raw = randomBytes(24).toString('hex');
      const created = await this.prisma.familyInvite.create({
        data: {
          familyId: inv.familyId,
          role: inv.role,
          label: inv.label,
          email: address,
          tokenHash: this.hash(raw),
          tokenEncrypted: encrypt(raw),
          createdById: userId,
        },
      });
      result = { id: created.id, role: created.role, label: created.label, email: created.email };
    }

    const family = await this.prisma.family.findUnique({ where: { id: inv.familyId }, select: { name: true } });
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/?invite=${raw}`;
    const familyName = family?.name ?? 'their family';
    await this.email.send(
      address,
      `${actor.displayName} invited you to Roost HQ`,
      this.inviteEmailText(actor.displayName, familyName, url),
      this.inviteEmailHtml(actor.displayName, familyName, url, cleanBaseUrl),
    );
    return { ...result, token: raw, sentTo: address };
  }

  // Same cross-family reach as resend()/regenerate() above - an owner can
  // revoke an invite on any family, not just their own.
  async revoke(familyId: string, userId: string, id: string) {
    const actor = await this.assertAdultOrOwner(userId);
    await this.prisma.familyInvite.deleteMany({ where: { id, ...(actor.role === 'OWNER' ? {} : { familyId }) } });
    return { ok: true };
  }

  // Deliberately different from resend() above: this is "kill the old link,
  // give me a genuinely new one" (e.g. the old one leaked, or someone wants
  // to be sure a stale copy stops working) - mints a fresh token and revokes
  // the old one on purpose, every time, regardless of whether the old row
  // had a recoverable tokenEncrypted or not. Same cross-family reach as
  // resend() above, and the same reason it needed one.
  async regenerate(familyId: string, userId: string, id: string) {
    const actor = await this.assertAdultOrOwner(userId);
    const existing = await this.prisma.familyInvite.findFirst({
      where: { id, acceptedAt: null, ...(actor.role === 'OWNER' ? {} : { familyId }) },
    });
    if (!existing) throw new NotFoundException('Invite not found (or already accepted)');
    await this.prisma.familyInvite.delete({ where: { id } });
    const raw = randomBytes(24).toString('hex');
    const inv = await this.prisma.familyInvite.create({
      data: {
        familyId: existing.familyId,
        role: existing.role,
        label: existing.label,
        email: existing.email,
        tokenHash: this.hash(raw),
        tokenEncrypted: encrypt(raw),
        createdById: userId,
      },
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
