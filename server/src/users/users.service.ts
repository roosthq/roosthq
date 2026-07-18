import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashPin } from '../crypto/pin';

type Role = 'OWNER' | 'ADULT' | 'KID';
type FontSize = 'sm' | 'md' | 'lg' | 'xl';
const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg', 'xl'];
export const COLOR_THEMES = ['meadow', 'ocean', 'ember', 'lavender', 'slate', 'rose', 'sand', 'mint', 'midnight'];
// Self-hosters can pick which theme new members start on via DEFAULT_COLOR_THEME
// in .env; falls back to the brand default if unset or not a real theme id.
export const DEFAULT_COLOR_THEME = COLOR_THEMES.includes(process.env.DEFAULT_COLOR_THEME ?? '')
  ? (process.env.DEFAULT_COLOR_THEME as string)
  : 'meadow';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list(familyId: string) {
    const users = await this.prisma.user.findMany({
      where: { familyId },
      select: { id: true, displayName: true, role: true, avatar: true, pinHash: true, colorTheme: true },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      avatar: u.avatar,
      hasPin: !!u.pinHash,
      colorTheme: u.colorTheme,
    }));
  }

  // Everyone manages their own PIN. Adults additionally manage kids' PINs.
  // Only the owner manages another adult's (or the owner's own via the same rule).
  async setPin(actorId: string, familyId: string, targetId: string, pin: string | null) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor) throw new ForbiddenException();
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');

    const isSelf = actorId === targetId;
    const allowed = isSelf || actor.role === 'OWNER' || (actor.role === 'ADULT' && target.role === 'KID');
    if (!allowed) throw new ForbiddenException("Not allowed to manage this member's PIN");

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

  // Wipe a member's token/purchase/notification history — not their account.
  // Everyone can reset themselves; any adult/owner can reset a kid; only the
  // owner can reset another adult or owner. Leaves the User row itself alone
  // (role, PIN, theme, text size, email-notify preference all survive).
  async resetAccount(actorId: string, familyId: string, targetId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'ADULT')) throw new ForbiddenException('Adults only');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');

    const isSelf = actorId === targetId;
    const allowed = isSelf || target.role === 'KID' || actor.role === 'OWNER';
    if (!allowed) throw new ForbiddenException('Not allowed to reset this member');

    await this.prisma.$transaction([
      this.prisma.tokenLedger.deleteMany({ where: { userId: targetId } }),
      this.prisma.redemption.deleteMany({ where: { userId: targetId } }),
      this.prisma.notification.deleteMany({ where: { userId: targetId } }),
    ]);
    return { ok: true };
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
      // Chores created by this member (cascades to instances/checklist). Their
      // assignments on other chores cascade automatically when the user is deleted.
      this.prisma.chore.deleteMany({ where: { createdById: targetId } }),
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
