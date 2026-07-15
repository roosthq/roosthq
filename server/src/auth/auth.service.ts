import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GoogleService } from '../google/google.service';
import { InvitesService } from '../invites/invites.service';
import { encrypt, decrypt } from '../crypto/token-crypto';

export type CallbackResult =
  | { status: 'ok'; userId: string; familyId: string; linkedMember: boolean }
  | { status: 'need_invite' };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private google: GoogleService,
    private invites: InvitesService,
  ) {}

  private async cleanupIfEmpty(familyId: string) {
    const count = await this.prisma.user.count({ where: { familyId } });
    if (count === 0) {
      await this.prisma.family.delete({ where: { id: familyId } }).catch(() => undefined);
    }
  }

  // Handle the OAuth callback.
  //  - existing account         -> sign in
  //  - signed in + mode 'self'  -> attach this Google account to the CURRENT user
  //  - signed in + mode 'member'-> create a new ADULT person in the family
  //  - not signed in            -> create a new family with this account as OWNER
  async handleGoogleCallback(
    code: string,
    ctx: { userId?: string; familyId?: string; mode?: 'self' | 'member'; inviteToken?: string },
  ): Promise<CallbackResult> {
    const { tokens, profile } = await this.google.exchangeCode(code);
    const googleSub = profile.id as string;
    const email = profile.email ?? undefined;
    const name = profile.name ?? email ?? 'Member';
    const avatar = profile.picture ?? undefined;
    const encTokens = encrypt(JSON.stringify(tokens));

    const invite = ctx.inviteToken ? await this.invites.resolve(ctx.inviteToken) : null;

    const existing = await this.prisma.googleAccount.findUnique({
      where: { googleSub },
      include: { user: true },
    });

    // Returning account — refresh tokens. Without prompt=consent forced on every
    // login, Google usually omits refresh_token from a repeat authorization, so
    // merge onto the previously stored tokens instead of overwriting — otherwise
    // the very next login would wipe out the refresh_token we already have.
    if (existing) {
      const current = JSON.parse(decrypt(existing.tokensEncrypted));
      const merged = { ...current, ...tokens };
      await this.prisma.googleAccount.update({
        where: { id: existing.id },
        data: { tokensEncrypted: encrypt(JSON.stringify(merged)) },
      });
      // Accepted an invite for a different family (e.g. fixing a mis-created account):
      // move this person into the inviting family and clean up their old empty family.
      if (invite && invite.familyId !== existing.user.familyId) {
        const oldFamilyId = existing.user.familyId;
        await this.prisma.user.update({
          where: { id: existing.userId },
          data: { familyId: invite.familyId, role: invite.role },
        });
        await this.invites.markAccepted(invite.id);
        await this.cleanupIfEmpty(oldFamilyId);
        return { status: 'ok', userId: existing.userId, familyId: invite.familyId, linkedMember: false };
      }
      return { status: 'ok', userId: existing.userId, familyId: existing.user.familyId, linkedMember: false };
    }

    // New account joining via an invite link.
    if (invite) {
      const user = await this.prisma.user.create({
        data: { familyId: invite.familyId, role: invite.role, displayName: name, email, avatar },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, tokensEncrypted: encTokens },
      });
      await this.invites.markAccepted(invite.id);
      return { status: 'ok', userId: user.id, familyId: invite.familyId, linkedMember: false };
    }

    // Owner adding another of their own calendars (in-browser).
    if (ctx.familyId && ctx.userId && ctx.mode === 'self') {
      await this.prisma.googleAccount.create({
        data: { userId: ctx.userId, googleSub, tokensEncrypted: encTokens },
      });
      return { status: 'ok', userId: ctx.userId, familyId: ctx.familyId, linkedMember: false };
    }

    // Owner adding a member in-browser (kept as a convenience; added as ADULT).
    if (ctx.familyId && ctx.mode === 'member') {
      const user = await this.prisma.user.create({
        data: { familyId: ctx.familyId, role: 'ADULT', displayName: name, email, avatar },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, tokensEncrypted: encTokens },
      });
      return { status: 'ok', userId: user.id, familyId: ctx.familyId, linkedMember: true };
    }

    // No invite, no session. The very first login bootstraps the family (owner);
    // after that, joining requires an invite.
    const familyCount = await this.prisma.family.count();
    if (familyCount === 0) {
      const family = await this.prisma.family.create({ data: { name: `${name}'s Family` } });
      const user = await this.prisma.user.create({
        data: { familyId: family.id, role: 'OWNER', displayName: name, email, avatar },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, tokensEncrypted: encTokens },
      });
      return { status: 'ok', userId: user.id, familyId: family.id, linkedMember: false };
    }

    // Unknown account, no invite: do not create anything.
    return { status: 'need_invite' };
  }

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        avatar: true,
        familyId: true,
        themePref: true,
        colorTheme: true,
        fontSizePref: true,
        notifyByEmail: true,
      },
    });
  }

  // All members of a family, for profile switching on shared devices.
  members(familyId: string) {
    return this.prisma.user.findMany({
      where: { familyId },
      select: { id: true, displayName: true, role: true, avatar: true },
    });
  }
}
