import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma.service';
import { GoogleService } from '../google/google.service';
import { InvitesService } from '../invites/invites.service';
import { EmailService } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailHtml } from '../notifications/email-template';
import { encrypt, decrypt } from '../crypto/token-crypto';
import { hashPassword, verifyPassword } from '../crypto/password';
import { DEFAULT_COLOR_THEME } from '../users/users.service';
import { defaultDisabledFeatures } from '../common/features';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Adults/owner need a real way to be reached (password reset, notifications);
// kids are parent-managed and typically have none.
function emailRequired(role: string): boolean {
  return role !== 'KID';
}

// Casey's own instruction 2026-09-13: tokens are a kid reward economy by
// default - an adult isn't doing chores to earn an allowance the way a kid
// is, so a new adult/owner/family-manager account starts with tokens OFF;
// a kid still starts earning them. An adult can still turn it back on for
// themselves via MembersManager (the "Earns tokens" checkbox) - this only
// changes the starting point.
function defaultTokensDisabled(role: string): boolean {
  return role !== 'KID';
}

export type CallbackResult =
  | { status: 'ok'; userId: string; familyId: string; linkedMember: boolean }
  | { status: 'need_invite' };

export interface LocalRegisterInput {
  displayName: string;
  email?: string;
  username?: string;
  password: string;
  inviteToken?: string;
  // First-run only: the code printed in the server log (see claimFirstFamily).
  setupCode?: string;
}

const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-password-timing-equalizer');

function normalizeCode(code: string | undefined): string {
  return (code ?? '').replace(/[\s-]/g, '').toUpperCase();
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private setupCodeValue: string | null = null;
  private bootstrapLock: Promise<void> = Promise.resolve();

  constructor(
    private prisma: PrismaService,
    private google: GoogleService,
    private invites: InvitesService,
    private email: EmailService,
    private notifications: NotificationsService,
  ) {}

  // A brand-new instance has no owner yet, and "first visitor becomes the
  // owner" is a race anyone who finds the URL can win (the owner role reaches
  // instance-wide powers, including the updater). So creating the very first
  // family requires a setup code that only someone with access to the server's
  // logs (or its .env, via SETUP_CODE) can read.
  async needsSetup(): Promise<boolean> {
    return (await this.prisma.family.count()) === 0;
  }

  private setupCode(): string {
    if (process.env.SETUP_CODE) return process.env.SETUP_CODE;
    if (!this.setupCodeValue) {
      const hex = randomBytes(6).toString('hex').toUpperCase();
      this.setupCodeValue = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
    }
    return this.setupCodeValue;
  }

  async onModuleInit() {
    if (await this.needsSetup().catch(() => false)) {
      this.logger.warn(`FIRST-TIME SETUP: open the app and create the owner account with this SETUP CODE: ${this.setupCode()}`);
    }
  }

  // Runs `create` only if the code matches AND nobody has claimed the instance
  // yet. Serialized in-process (one server instance) so two simultaneous
  // first-run requests can't both become owner.
  private async claimFirstFamily<T>(code: string | undefined, create: () => Promise<T>): Promise<T | null> {
    const previous = this.bootstrapLock;
    let release!: () => void;
    this.bootstrapLock = new Promise<void>((r) => (release = r));
    await previous;
    try {
      if (!(await this.needsSetup())) return null;
      const expected = Buffer.from(normalizeCode(this.setupCode()));
      const given = Buffer.from(normalizeCode(code));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new ForbiddenException(
          'First-time setup needs the setup code from your server logs (run: docker compose logs server | grep "SETUP CODE").',
        );
      }
      return await create();
    } finally {
      release();
    }
  }

  // Signed-in adults only: kids must never be able to add (or become) adults.
  private async assertAdultSession(userId: string | undefined, familyId: string | undefined) {
    const actor = userId ? await this.prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!actor || actor.familyId !== familyId || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role)) {
      throw new ForbiddenException('Only an adult can add a family member');
    }
  }

  // "🎉 {name} joined the family!" to everyone already there - all roles,
  // kids included (NotificationsService.notifyFamily), whenever an invite
  // lands someone in the family: a brand-new signup (Google or local) or an
  // existing account switching families via one. The new member themselves
  // is excluded - they already know.
  private async notifyFamilyOfNewMember(familyId: string, newUserId: string, displayName: string) {
    await this.notifications.notifyFamily(familyId, 'MEMBER_JOINED', `🎉 ${displayName} joined the family!`, {
      link: '/profile',
      excludeUserId: newUserId,
    });
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

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
    ctx: { userId?: string; familyId?: string; mode?: 'self' | 'member'; inviteToken?: string; setupCode?: string },
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

    // Returning account - refresh tokens. Without prompt=consent forced on every
    // login, Google usually omits refresh_token from a repeat authorization, so
    // merge onto the previously stored tokens instead of overwriting - otherwise
    // the very next login would wipe out the refresh_token we already have.
    if (existing) {
      const current = JSON.parse(decrypt(existing.tokensEncrypted));
      const merged = { ...current, ...tokens };
      await this.prisma.googleAccount.update({
        where: { id: existing.id },
        // Reaching the callback with a valid code proves this account is
        // usable again - clears any stale "needs reconnect" from a dead
        // refresh token, whether or not Google actually sent a new one.
        // email also refreshed in case it changed since first connect.
        data: { tokensEncrypted: encrypt(JSON.stringify(merged)), needsReconnect: false, email, picture: avatar },
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
        await this.notifyFamilyOfNewMember(invite.familyId, existing.userId, existing.user.displayName);
        await this.cleanupIfEmpty(oldFamilyId);
        return { status: 'ok', userId: existing.userId, familyId: invite.familyId, linkedMember: false };
      }
      return { status: 'ok', userId: existing.userId, familyId: existing.user.familyId, linkedMember: false };
    }

    // New account joining via an invite link.
    if (invite) {
      const user = await this.prisma.user.create({
        data: {
          familyId: invite.familyId,
          role: invite.role,
          displayName: name,
          email,
          avatar,
          colorTheme: DEFAULT_COLOR_THEME,
          tokensDisabled: defaultTokensDisabled(invite.role),
        },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, email, picture: avatar, tokensEncrypted: encTokens },
      });
      await this.invites.markAccepted(invite.id);
      await this.notifyFamilyOfNewMember(invite.familyId, user.id, name);
      return { status: 'ok', userId: user.id, familyId: invite.familyId, linkedMember: false };
    }

    // Owner adding another of their own calendars (in-browser).
    if (ctx.familyId && ctx.userId && ctx.mode === 'self') {
      await this.prisma.googleAccount.create({
        data: { userId: ctx.userId, googleSub, email, picture: avatar, tokensEncrypted: encTokens },
      });
      return { status: 'ok', userId: ctx.userId, familyId: ctx.familyId, linkedMember: false };
    }

    // Owner adding a member in-browser (kept as a convenience; added as ADULT).
    if (ctx.familyId && ctx.mode === 'member') {
      await this.assertAdultSession(ctx.userId, ctx.familyId);
      const user = await this.prisma.user.create({
        data: {
          familyId: ctx.familyId,
          role: 'ADULT',
          displayName: name,
          email,
          avatar,
          colorTheme: DEFAULT_COLOR_THEME,
          tokensDisabled: true,
        },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, email, picture: avatar, tokensEncrypted: encTokens },
      });
      return { status: 'ok', userId: user.id, familyId: ctx.familyId, linkedMember: true };
    }

    // No invite, no session. The very first login bootstraps the family (owner);
    // after that, joining requires an invite.
    const claimed = await this.claimFirstFamily<CallbackResult>(ctx.setupCode, async () => {
      const family = await this.prisma.family.create({
        data: { name: `${name}'s Family`, disabledFeatures: defaultDisabledFeatures() },
      });
      const user = await this.prisma.user.create({
        data: { familyId: family.id, role: 'OWNER', displayName: name, email, avatar, colorTheme: DEFAULT_COLOR_THEME, tokensDisabled: true },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, email, picture: avatar, tokensEncrypted: encTokens },
      });
      return { status: 'ok', userId: user.id, familyId: family.id, linkedMember: false };
    });
    if (claimed) return claimed;

    // Unknown account, no invite: do not create anything.
    return { status: 'need_invite' };
  }

  // Google is now optional - a family can be bootstrapped, or a member added,
  // entirely with a local username/email + password. Mirrors
  // handleGoogleCallback's branching (invite vs. first-ever login vs. nobody
  // home) but for local credentials instead of a Google profile.
  async registerLocal(input: LocalRegisterInput): Promise<CallbackResult> {
    const email = input.email?.trim() || undefined;
    const username = input.username?.trim() || undefined;
    if (!input.password || input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const invite = input.inviteToken ? await this.invites.resolve(input.inviteToken) : null;
    // Self-registering with no invite always bootstraps a brand-new family as
    // its OWNER - never a kid - so email is required either way here.
    const role = invite?.role ?? 'OWNER';
    if (emailRequired(role) && !email) throw new BadRequestException('Email is required');
    if (!email && !username) throw new BadRequestException('An email or username is required');
    if (username) {
      const takenUsername = await this.prisma.user.findUnique({ where: { username } });
      if (takenUsername) throw new BadRequestException('That username is already taken');
    }
    if (email) {
      const takenEmail = await this.prisma.user.findFirst({ where: { email, passwordHash: { not: null } } });
      if (takenEmail) throw new BadRequestException('An account with that email already exists');
    }
    const passwordHash = hashPassword(input.password);

    if (invite) {
      const user = await this.prisma.user.create({
        data: {
          familyId: invite.familyId,
          role: invite.role,
          displayName: input.displayName,
          email,
          username,
          passwordHash,
          colorTheme: DEFAULT_COLOR_THEME,
          tokensDisabled: defaultTokensDisabled(invite.role),
        },
      });
      await this.invites.markAccepted(invite.id);
      await this.notifyFamilyOfNewMember(invite.familyId, user.id, input.displayName);
      return { status: 'ok', userId: user.id, familyId: invite.familyId, linkedMember: false };
    }

    const claimed = await this.claimFirstFamily<CallbackResult>(input.setupCode, async () => {
      const family = await this.prisma.family.create({
        data: { name: `${input.displayName}'s Family`, disabledFeatures: defaultDisabledFeatures() },
      });
      const user = await this.prisma.user.create({
        data: {
          familyId: family.id,
          role: 'OWNER',
          displayName: input.displayName,
          email,
          username,
          passwordHash,
          colorTheme: DEFAULT_COLOR_THEME,
          tokensDisabled: true,
        },
      });
      return { status: 'ok', userId: user.id, familyId: family.id, linkedMember: false };
    });
    if (claimed) return claimed;

    return { status: 'need_invite' };
  }

  // Adult/owner adds a member directly (Settings "add a kid" flow, task #11)
  // - always requires an existing session (ctx), never bootstraps a family.
  async createLocalMember(
    actorId: string,
    familyId: string,
    role: 'ADULT' | 'KID',
    input: { displayName: string; email?: string; username?: string; password?: string },
  ) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.familyId !== familyId || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role)) {
      throw new UnauthorizedException('Adults only');
    }
    if (!input.displayName?.trim()) throw new BadRequestException('Name is required');
    const email = input.email?.trim() || undefined;
    const username = input.username?.trim() || undefined;
    if (emailRequired(role) && !email) throw new BadRequestException('Email is required');
    if (username) {
      const taken = await this.prisma.user.findUnique({ where: { username } });
      if (taken) throw new BadRequestException('That username is already taken');
    }
    if (input.password && input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const passwordHash = input.password ? hashPassword(input.password) : undefined;
    return this.prisma.user.create({
      data: {
        familyId,
        role,
        displayName: input.displayName,
        email,
        username,
        passwordHash,
        colorTheme: DEFAULT_COLOR_THEME,
        tokensDisabled: defaultTokensDisabled(role),
      },
      select: { id: true, familyId: true, role: true, displayName: true, email: true, username: true, colorTheme: true },
    });
  }

  async loginLocal(identifier: string, password: string): Promise<{ userId: string; familyId: string } | null> {
    const id = identifier.trim();
    if (!id || !password) return null;
    const user = await this.prisma.user.findFirst({ where: { OR: [{ email: id }, { username: id }] } });
    // Always do one hash verification, even for an unknown account, so response
    // time does not reveal which emails/usernames exist.
    const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user?.passwordHash || !ok) return null;
    return { userId: user.id, familyId: user.familyId };
  }

  // Two paths in one: an owner/family manager resetting a local account's
  // password directly (the fallback for a kid, or anyone, with no email on
  // file - no current password needed, same as resetting a PIN), OR anyone
  // - including a kid now - changing their OWN password. Self-service
  // requires the current password when one's already set (nothing to
  // confirm against on a Google-only account setting a local password for
  // the first time) so a hijacked session cookie alone can't silently swap
  // out someone's credential.
  async setLocalPassword(actorId: string, familyId: string, targetId: string, password: string, currentPassword?: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new UnauthorizedException();
    const isSelf = actorId === targetId;
    const isAdminOverride = actor.role === 'OWNER' || actor.role === 'FAMILY_MANAGER';
    if (!isSelf && !isAdminOverride) {
      throw new UnauthorizedException('Owner or family manager only, for anyone but yourself');
    }
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new BadRequestException('Member not found');
    // A family manager must not be able to reset the owner's password and
    // sign in as them - the owner role carries instance-wide powers.
    if (!isSelf && target.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new UnauthorizedException('Only the owner can reset the owner password');
    }
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    if (isSelf && target.passwordHash) {
      if (!currentPassword || !verifyPassword(currentPassword, target.passwordHash)) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }
    await this.prisma.user.update({ where: { id: targetId }, data: { passwordHash: hashPassword(password) } });
    return { ok: true };
  }

  // Self-service: display name, username, email, avatar. Anyone can change
  // their own - no role gate - but a role that requires an email on file
  // (see emailRequired) can't blank it out via this path.
  async updateProfile(
    userId: string,
    dto: { displayName?: string; username?: string; email?: string | null; avatar?: string | null },
    ghostedBy?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const data: { displayName?: string; username?: string | null; email?: string | null; avatar?: string | null } = {};

    if (dto.displayName !== undefined) {
      const trimmed = dto.displayName.trim();
      if (!trimmed) throw new BadRequestException('Display name is required');
      data.displayName = trimmed;
    }

    if (dto.username !== undefined) {
      const trimmed = dto.username?.trim() || null;
      if (trimmed && trimmed !== user.username) {
        const taken = await this.prisma.user.findUnique({ where: { username: trimmed } });
        if (taken) throw new BadRequestException('That username is already taken');
      }
      data.username = trimmed;
    }

    if (dto.email !== undefined) {
      const trimmed = dto.email?.trim() || null;
      if (!trimmed && emailRequired(user.role)) throw new BadRequestException('Email is required for this account');
      if (trimmed && trimmed !== user.email) {
        const taken = await this.prisma.user.findFirst({ where: { email: trimmed, passwordHash: { not: null } } });
        if (taken) throw new BadRequestException('An account with that email already exists');
      }
      data.email = trimmed;
    }

    if (dto.avatar !== undefined) data.avatar = dto.avatar?.trim() || null;

    await this.prisma.user.update({ where: { id: userId }, data });
    // Same fix as the OAuth-reconnect flow (auth.controller.ts): re-deriving
    // "me" after an action must carry the ghost session forward, or this
    // explicitly returns ghostedBy: null and silently ends an app-owner's
    // ghost session (banner gone) the moment they edit their name/avatar/etc
    // while ghosted - even though the actual session cookie never changed.
    return this.me({ userId, ghostedBy });
  }

  // Self-service path for anyone with an email on file (mainly adults/owner,
  // since email is required for them at signup). Always resolves the same
  // way whether or not the email matches an account, so a caller can't use
  // this to probe which addresses are registered.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.trim(), passwordHash: { not: null } } });
    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: this.hashToken(raw), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const link = `${WEB_URL}/?resetToken=${raw}`;
      await this.email.send(
        user.email!,
        'Reset your Roost HQ password',
        `Reset your password: ${link}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore it.`,
        emailHtml({
          webUrl: WEB_URL,
          heading: 'Reset your password',
          bodyHtml: `<p style="margin:0;">Click below to set a new one.</p>`,
          buttonText: 'Reset password',
          buttonUrl: link,
          footnote: "This link expires in 1 hour. If you didn't ask for this, you can ignore it.",
        }),
      );
    }
    return { ok: true };
  }

  async resetPassword(rawToken: string, password: string) {
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password) } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async me(session: { userId: string; ghostedBy?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        familyId: true,
        themePref: true,
        colorTheme: true,
        fontSizePref: true,
        soundEffects: true,
        simpleMode: true,
        kidView: true,
        birthday: true,
        disabledPermissions: true,
        notifyByEmail: true,
        passwordHash: true, // stripped below - only its presence (hasPassword) ever leaves this method
      },
    });
    if (!user) return user;
    // Never return the hash itself - just whether one exists, so the
    // password-change form knows whether to ask for the current one.
    const { passwordHash, ...rest } = user;
    const withHasPassword = { ...rest, hasPassword: !!passwordHash };
    // Surface who's actually driving this session - the frontend shows a
    // "Ghosting as X - return to Owner" banner whenever this is set.
    if (session.ghostedBy) {
      const owner = await this.prisma.user.findUnique({
        where: { id: session.ghostedBy },
        select: { id: true, displayName: true },
      });
      return { ...withHasPassword, ghostedBy: owner };
    }
    return { ...withHasPassword, ghostedBy: null };
  }

  // All members of a family, for profile switching on shared devices.
  members(familyId: string) {
    return this.prisma.user.findMany({
      where: { familyId },
      select: {
        id: true,
        displayName: true,
        role: true,
        avatar: true,
        tokensDisabled: true,
        simpleMode: true,
        birthday: true,
        disabledPermissions: true,
        presenceStatus: true,
        presenceLocationId: true,
      },
    });
  }
}
