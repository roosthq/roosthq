import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashPin } from '../crypto/pin';
import { AuditLogService } from '../security/audit-log.service';

type Role = 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID';
function isFamilyManager(role?: string): boolean {
  return role === 'OWNER' || role === 'FAMILY_MANAGER';
}
type FontSize = 'sm' | 'md' | 'lg' | 'xl';
const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg', 'xl'];
export const COLOR_THEMES = ['meadow', 'ocean', 'ember', 'lavender', 'slate', 'rose', 'sand', 'mint', 'midnight', 'stone', 'crimson', 'teal', 'amber', 'indigo'];
// Self-hosters can pick which theme new members start on via DEFAULT_COLOR_THEME
// in .env; falls back to the brand default if unset or not a real theme id.
export const DEFAULT_COLOR_THEME = COLOR_THEMES.includes(process.env.DEFAULT_COLOR_THEME ?? '')
  ? (process.env.DEFAULT_COLOR_THEME as string)
  : 'meadow';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  // Any adult can ghost as a KID in their OWN family - the whole point is
  // letting a kid hand an adult's already-unlocked phone to themselves and
  // do something (complete a chore) without needing their own login. Much
  // narrower than OwnerService.ghost(): same family only, kid targets only,
  // any adult role rather than the literal instance OWNER. Session-cookie
  // mechanics (and unghost) are shared with that one - see users.controller.ts.
  async ghostChild(actorId: string, familyId: string, targetUserId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role)) throw new ForbiddenException('Adults only');
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role !== 'KID') throw new ForbiddenException('Can only ghost as a kid in your own family this way');
    await this.audit.record({
      actorId,
      actorName: actor.displayName,
      action: 'ghost.start',
      targetId: target.id,
      targetLabel: target.displayName,
      familyId,
    });
    return { userId: target.id, familyId: target.familyId, ghostedBy: actorId };
  }

  async list(familyId: string) {
    const users = await this.prisma.user.findMany({
      where: { familyId },
      select: {
        id: true,
        displayName: true,
        role: true,
        avatar: true,
        pinHash: true,
        pinDisabled: true,
        colorTheme: true,
        tokensDisabled: true,
        simpleMode: true,
        kidView: true,
        allowanceTokens: true,
        birthday: true,
        disabledPermissions: true,
        bonusStreakFreezes: true,
        presenceStatus: true,
        presenceLocationId: true,
        presenceUpdatedAt: true,
      },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      avatar: u.avatar,
      hasPin: !!u.pinHash,
      pinDisabled: u.pinDisabled,
      colorTheme: u.colorTheme,
      simpleMode: u.simpleMode,
      kidView: u.kidView,
      allowanceTokens: u.allowanceTokens,
      birthday: u.birthday,
      disabledPermissions: Array.isArray(u.disabledPermissions) ? u.disabledPermissions : [],
      tokensDisabled: u.tokensDisabled,
      bonusStreakFreezes: u.bonusStreakFreezes,
      presenceStatus: u.presenceStatus,
      presenceLocationId: u.presenceLocationId,
      presenceUpdatedAt: u.presenceUpdatedAt,
    }));
  }

  // Everyone manages their own PIN. Adults additionally manage kids' PINs -
  // except a kid whose PIN has been turned off entirely (pinDisabled): they
  // can still be cleared (pin: null is always a no-op-or-better), but not
  // given a new one, so the "no PIN for this kid" decision actually sticks
  // instead of being one "Set" tap away from undone.
  async setPin(actorId: string, familyId: string, targetId: string, pin: string | null) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');

    const isSelf = actorId === targetId;
    const allowed = isSelf || isFamilyManager(actor.role) || (actor.role === 'ADULT' && target.role === 'KID');
    if (!allowed) throw new ForbiddenException("Not allowed to manage this member's PIN");
    // The owner PIN unlocks an owner session at the kiosk, so a family manager
    // must not be able to set it (same rule setRole/remove already apply).
    if (!isSelf && target.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can change the owner PIN');
    }
    if (pin && !/^\d{4,8}$/.test(pin)) throw new BadRequestException('A PIN must be 4 to 8 digits');
    if (pin && target.pinDisabled) throw new ForbiddenException('PINs are turned off for this kid - allow one first');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { pinHash: pin ? hashPin(pin) : null },
    });
    return { ok: true };
  }

  // Kid-only master switch: not just "don't ask" - nobody can give this kid a
  // kiosk PIN at all until it's turned back off. Turning it on clears
  // whatever PIN was already stored, so the "no PIN" decision is immediate
  // and can't be undone by simply leaving a stale one in place. Adults are
  // exempt on purpose: their PIN is a real kiosk security boundary (see
  // DisplayService.unlock), not a convenience, so it can't be waived at all.
  async setPinDisabled(actorId: string, familyId: string, targetId: string, disabled: boolean) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role !== 'KID') throw new ForbiddenException('Only a kid PIN can be disabled this way');

    const allowed = isFamilyManager(actor.role) || actor.role === 'ADULT';
    if (!allowed) throw new ForbiddenException("Not allowed to manage this member's PIN");

    await this.prisma.user.update({
      where: { id: targetId },
      data: { pinDisabled: disabled, ...(disabled ? { pinHash: null } : {}) },
    });
    return { ok: true, pinDisabled: disabled };
  }

  // Owner/family manager can change roles (e.g. mark a newly-added member as a
  // KID) - but only the instance owner can grant or revoke the OWNER role
  // itself, since that role now carries instance-wide powers (multi-family,
  // ghosting), not just this family's.
  async setRole(actorId: string, familyId: string, targetId: string, role: Role) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !isFamilyManager(actor.role)) throw new ForbiddenException('Owner or family manager only');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    if ((role === 'OWNER' || target.role === 'OWNER') && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can change the owner role');
    }
    await this.prisma.user.update({ where: { id: targetId }, data: { role } });
    return { ok: true };
  }

  // Current user's own app theme preference.
  async setTheme(userId: string, theme: 'light' | 'dark') {
    const t = theme === 'dark' ? 'dark' : 'light';
    await this.prisma.user.update({ where: { id: userId }, data: { themePref: t } });
    return { ok: true, theme: t };
  }

  // Current user's own full page theme (kiosk-identifiable "micro-theme").
  async setColorTheme(userId: string, colorTheme: string) {
    const c = COLOR_THEMES.includes(colorTheme) ? colorTheme : DEFAULT_COLOR_THEME;
    await this.prisma.user.update({ where: { id: userId }, data: { colorTheme: c } });
    return { ok: true, colorTheme: c };
  }

  // Current user's own app text-size preference.
  async setFontSize(userId: string, fontSize: FontSize) {
    const f = FONT_SIZES.includes(fontSize) ? fontSize : 'md';
    await this.prisma.user.update({ where: { id: userId }, data: { fontSizePref: f } });
    return { ok: true, fontSize: f };
  }

  // Current user's own "also email me notifications" preference.
  async setNotifyByEmail(userId: string, notifyByEmail: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { notifyByEmail } });
    return { ok: true, notifyByEmail };
  }

  // #4 - level-up celebration. Level is XP derived from lifetime tokens
  // EARNED (never reduced by spending) - same sqrt-pacing formula as
  // levelFor() in web/src/api.ts, kept in sync by hand like the other
  // client/server mirrors in this codebase. Comparing against (and then
  // bumping) lastCelebratedLevel in the SAME request is what makes this
  // idempotent - a refresh, or two surfaces checking at once, never fires
  // it twice for the same level.
  //
  // Sums dollarEquivalent, not raw delta - an invariant lifetime total that
  // doesn't move when the family's token scale changes later (PLANNING.md
  // §17). REBASE entries are excluded outright (a rescale isn't earning).
  // For any row written before this existed, or for a family that's never
  // rescaled, dollarEquivalent === delta, so this is byte-for-byte identical
  // to the old raw-delta sum today.
  async levelCheck(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const agg = await this.prisma.tokenLedger.aggregate({
      where: { userId, delta: { gt: 0 }, type: { not: 'REBASE' } },
      _sum: { dollarEquivalent: true },
    });
    const earned = agg._sum.dollarEquivalent ?? 0;
    const newLevel = Math.floor(Math.sqrt(Math.max(0, earned) / 5)) + 1;
    if (newLevel > user.lastCelebratedLevel) {
      await this.prisma.user.update({ where: { id: userId }, data: { lastCelebratedLevel: newLevel } });
      return { leveledUp: true, oldLevel: user.lastCelebratedLevel, newLevel };
    }
    return { leveledUp: false, oldLevel: user.lastCelebratedLevel, newLevel };
  }

  // Adult sets a member's My Day simple mode and/or weekly allowance.
  async setMemberPrefs(
    actorId: string,
    familyId: string,
    targetId: string,
    prefs: { simpleMode?: boolean; kidView?: boolean; allowanceTokens?: number; birthday?: string | null; disabledPermissions?: string[] },
  ) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role)) throw new ForbiddenException('Adults only');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    await this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(prefs.simpleMode !== undefined && { simpleMode: !!prefs.simpleMode }),
        ...(prefs.kidView !== undefined && { kidView: !!prefs.kidView }),
        ...(prefs.allowanceTokens !== undefined && { allowanceTokens: Math.max(0, Math.round(prefs.allowanceTokens)) }),
        ...(prefs.birthday !== undefined && {
          birthday: prefs.birthday && /^\d{4}-\d{2}-\d{2}$/.test(prefs.birthday) ? prefs.birthday : null,
        }),
        ...(prefs.disabledPermissions !== undefined && {
          disabledPermissions: prefs.disabledPermissions.filter((x) => typeof x === 'string'),
        }),
      },
    });
    return { ok: true };
  }

  // Adult "giving" stats for the profile page: what this person has handed
  // out, not what they've earned. Approvals exclude self-approvals (an adult
  // finishing their own chore isn't reviewing anyone).
  async givenStats(familyId: string, targetId: string) {
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    const [given, awards, approvals] = await Promise.all([
      this.prisma.tokenLedger.aggregate({
        where: { createdById: targetId, delta: { gt: 0 }, userId: { not: targetId }, user: { familyId } },
        _sum: { delta: true },
      }),
      this.prisma.awardGrant.count({ where: { grantedById: targetId, award: { familyId } } }),
      this.prisma.choreInstance.count({
        where: { approvedBy: targetId, status: 'APPROVED', chore: { familyId }, NOT: { claimedByUserId: targetId } },
      }),
    ]);
    return {
      tokensGiven: given._sum.delta ?? 0,
      awardsGiven: awards,
      approvals,
      rejections: target.rejectionsGiven,
    };
  }

  // Current user's own birthday. Kids don't manage their own (an adult sets
  // it in Family & PINs) - everyone else does.
  async setOwnBirthday(userId: string, birthday: string | null) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new ForbiddenException();
    if (u.role === 'KID') throw new ForbiddenException('An adult sets a kid’s birthday');
    const valid = birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null;
    await this.prisma.user.update({ where: { id: userId }, data: { birthday: valid } });
    return { ok: true, birthday: valid };
  }

  // Current user's own celebration-sound preference (app surfaces; the kiosk
  // follows its display's soundEffects setting instead).
  async setSoundEffects(userId: string, soundEffects: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { soundEffects: !!soundEffects } });
    return { ok: true, soundEffects: !!soundEffects };
  }

  // Who can flip tokensDisabled for whom (exact, as specified - deliberately
  // narrower than the PIN/reset rules above): a kid never can; a plain adult
  // only for a kid; a family manager for an adult, a kid, or themself (but
  // not another family manager or the owner); the owner for anyone,
  // including themself or another owner.
  async setTokensDisabled(actorId: string, familyId: string, targetId: string, disabled: boolean) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');

    const allowed =
      actor.role === 'OWNER' ||
      (actor.role === 'FAMILY_MANAGER' && (target.id === actor.id || target.role === 'ADULT' || target.role === 'KID')) ||
      (actor.role === 'ADULT' && target.role === 'KID');
    if (!allowed) throw new ForbiddenException('Not allowed to change tokens for this member');

    await this.prisma.user.update({ where: { id: targetId }, data: { tokensDisabled: disabled } });
    return { ok: true };
  }

  // Wipe a member's token/purchase/notification history - not their account.
  // Everyone can reset themselves; any adult/owner/family manager can reset a
  // kid; only the owner/family manager can reset another adult or owner.
  // Leaves the User row itself alone (role, PIN, theme, text size, email-notify
  // preference all survive).
  async resetAccount(actorId: string, familyId: string, targetId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || (!isFamilyManager(actor.role) && actor.role !== 'ADULT')) throw new ForbiddenException('Adults only');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');

    const isSelf = actorId === targetId;
    const allowed = isSelf || target.role === 'KID' || isFamilyManager(actor.role);
    if (!allowed) throw new ForbiddenException('Not allowed to reset this member');

    await this.prisma.$transaction([
      this.prisma.tokenLedger.deleteMany({ where: { userId: targetId } }),
      this.prisma.redemption.deleteMany({ where: { userId: targetId } }),
      this.prisma.notification.deleteMany({ where: { userId: targetId } }),
    ]);
    return { ok: true };
  }

  // Deletes one member and everything that is theirs alone (their own token
  // and streak-freeze history, presence log, sessions, linked Google accounts,
  // assignments, redemptions - the rest cascades from the user row). Things the
  // person only AUTHORED for the family - chores, rules, awards, calendars,
  // events, mini-games, grants made to other people, ledger entries credited to
  // other people - are handed to `heirId` instead of being deleted, so removing
  // an adult never erases the family's chores or silently changes a kid's
  // balance. All-or-nothing: one transaction.
  private async purgeMember(targetId: string, heirId: string) {
    const from = targetId;
    const to = heirId;
    await this.prisma.$transaction(async (tx) => {
      await tx.presenceLog.updateMany({ where: { setById: from, userId: { not: from } }, data: { setById: to } });
      await tx.localCalendar.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.localEvent.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.chore.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.choreBonusSettings.updateMany({ where: { updatedById: from }, data: { updatedById: to } });
      await tx.tokenLedger.updateMany({ where: { createdById: from, userId: { not: from } }, data: { createdById: to } });
      await tx.streakFreezeLedger.updateMany({ where: { createdById: from, userId: { not: from } }, data: { createdById: to } });
      await tx.tokenScaleEvent.updateMany({ where: { actorId: from }, data: { actorId: to } });
      await tx.rule.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.award.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.awardGrant.updateMany({ where: { grantedById: from }, data: { grantedById: to } });
      await tx.miniGame.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.miniGameGrant.updateMany({ where: { grantedById: from }, data: { grantedById: to } });
      await tx.publishedMiniGame.updateMany({ where: { createdById: from }, data: { createdById: to } });
      await tx.learningGamesSettings.updateMany({ where: { updatedById: from }, data: { updatedById: to } });
      await tx.userSubjectGrade.updateMany({ where: { setById: from }, data: { setById: to } });
      // Their own ledgers: ledger rows where THEY are the one being credited
      // cascade with the user; rows they authored for others were reassigned above.
      await tx.user.delete({ where: { id: from } });
    });
  }

  // Self-delete - adults and family managers only, confirmed client-side
  // before this is ever called. Blocked for a kid (needs an adult to do it
  // for them) and for the instance owner (deleting the one-of-a-kind OWNER
  // account would strand every family-instance-wide tool - Families,
  // Holidays - with nobody able to use them; move ownership elsewhere
  // first). Same cleanup transaction as remove() below, just self-targeted.
  async removeSelf(actorId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();
    if (actor.role === 'KID') throw new ForbiddenException('Ask an adult to remove your account');
    if (actor.role === 'OWNER') {
      throw new ForbiddenException('The instance owner can\'t delete their own account - move ownership to someone else first');
    }
    const others = { familyId: actor.familyId, id: { not: actorId } };
    const heir =
      (await this.prisma.user.findFirst({ where: { ...others, role: 'OWNER' }, select: { id: true } })) ??
      (await this.prisma.user.findFirst({ where: { ...others, role: { in: ['FAMILY_MANAGER', 'ADULT'] } }, select: { id: true } }));
    if (!heir) throw new ForbiddenException('Add another adult first - someone has to take over what you created');
    await this.purgeMember(actorId, heir.id);
    return { ok: true };
  }

  // Owner/family manager removes a member. Cleans up rows that would otherwise
  // block the delete (chores reference users without cascade). Can't remove
  // yourself or the instance owner (family managers included - the owner is
  // the one protected account).
  async remove(actorId: string, familyId: string, targetId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !isFamilyManager(actor.role)) throw new ForbiddenException('Owner or family manager only');
    if (actorId === targetId) throw new ForbiddenException('You cannot remove yourself');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot remove the owner');

    await this.purgeMember(targetId, actorId);
    return { ok: true };
  }
}
