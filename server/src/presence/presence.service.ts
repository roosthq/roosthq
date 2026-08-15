import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type PresenceStatus = 'HOME' | 'AWAY' | 'VACATION';

export interface SetPresenceInput {
  status: PresenceStatus;
  locationId?: string | null;
}

// #9 - "away shouldn't cost a streak." A person's presence is tracked
// per-household (Location), not just a flat home/not-home flag, because a
// family can be split across houses (divorced parents, staying at a
// grandparent's) and "home" only means something specific once there's more
// than one place it could mean. Two things back this:
//   - User.presenceStatus/presenceLocationId/presenceUpdatedAt - the current
//     value, denormalized for cheap reads (header widget, kiosk tiles).
//   - PresenceLog - append-only history, so "were they away ON the day a
//     chore came due" stays answerable even if they're back home by the time
//     the miss-sweep actually runs (which happens outside this file - see
//     chores.service.ts markMissedAndAdvance).
@Injectable()
export class PresenceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private isAdult(role?: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  private label(status: PresenceStatus): string {
    return status === 'VACATION' ? 'on vacation' : status === 'AWAY' ? 'away' : 'home';
  }

  // My current status plus the households I could pick from, for the
  // header/kiosk card picker.
  async mine(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { locations: { include: { location: true } } },
    });
    return {
      status: user.presenceStatus as PresenceStatus,
      locationId: user.presenceLocationId,
      updatedAt: user.presenceUpdatedAt,
      locations: user.locations.map((l) => ({ id: l.location.id, name: l.location.name })),
    };
  }

  // Self, or any adult setting a KID's status directly (same rule
  // UsersService.ghostChild uses for "hand me your phone") - deliberately
  // no broader adult-on-adult path; an adult's own presence is theirs to set.
  private async assertAllowed(actorId: string, familyId: string, targetId: string) {
    if (actorId === targetId) return;
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !this.isAdult(actor.role)) throw new ForbiddenException('Adults only');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, familyId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role !== 'KID') throw new ForbiddenException("Can only set a kid's status this way");
  }

  // Same self-or-adult-for-a-kid rule as set() below, read-only - lets a
  // profile page preload the right person's own households before opening
  // the picker for them.
  async forUser(actorId: string, familyId: string, targetId: string) {
    await this.assertAllowed(actorId, familyId, targetId);
    return this.mine(targetId);
  }

  async set(actorId: string, familyId: string, targetId: string, input: SetPresenceInput) {
    await this.assertAllowed(actorId, familyId, targetId);
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, familyId },
      include: { locations: true },
    });
    if (!target) throw new NotFoundException('Member not found');

    const status: PresenceStatus = input.status === 'AWAY' || input.status === 'VACATION' ? input.status : 'HOME';
    let locationId: string | null = null;
    if (status === 'HOME') {
      const myLocationIds = target.locations.map((l) => l.locationId);
      if (input.locationId) {
        if (!myLocationIds.includes(input.locationId)) {
          throw new BadRequestException("That household isn't one of theirs");
        }
        locationId = input.locationId;
      } else if (myLocationIds.length === 1) {
        // Single-household family (or a single-household person) - nothing
        // to actually pick, so don't force the picker just to confirm it.
        locationId = myLocationIds[0];
      } else if (myLocationIds.length > 1) {
        throw new BadRequestException('Pick which household');
      }
      // Zero locations at all: locationId stays null - HOME with nowhere
      // registered just means "not away/on vacation," which is still a
      // meaningful, valid state (e.g. a family with no locations set up yet).
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.presenceLog.updateMany({
        where: { userId: targetId, endedAt: null },
        data: { endedAt: now },
      }),
      this.prisma.presenceLog.create({
        data: { userId: targetId, status, locationId, setById: actorId, startedAt: now },
      }),
      this.prisma.user.update({
        where: { id: targetId },
        data: { presenceStatus: status, presenceLocationId: locationId, presenceUpdatedAt: now },
      }),
    ]);

    if (status !== 'HOME') {
      // Transparency, not a blocker - the household should know someone
      // they'd otherwise expect isn't going to be around.
      await this.notifications.notifyAdults(
        familyId,
        'CHORE_EXCUSED',
        `🧳 ${target.displayName} marked themselves ${this.label(status)}`,
        { link: '/profile', excludeUserId: actorId === targetId ? targetId : undefined },
      );
    }
    return this.mine(targetId);
  }

  // Status effective AS OF a specific instant - not "right now" - so the
  // chore-miss sweep can ask "were they away on the day this was due" even
  // if they've since come back (see class comment). null means no PresenceLog
  // row covers that instant at all - either this person has never touched
  // the feature, or the instant in question predates their very first status
  // change - and the caller (wasPresentForChore) treats that as "no signal,
  // don't excuse" rather than a real HOME-nowhere value: a location-scoped
  // chore's own present-at-that-location check would otherwise fail for
  // EVERY family the moment this feature ships, since nobody has any history
  // yet for a due date from before they ever opened the picker.
  private async effectiveAt(userId: string, at: Date): Promise<{ status: PresenceStatus; locationId: string | null } | null> {
    const row = await this.prisma.presenceLog.findFirst({
      where: { userId, startedAt: { lte: at }, OR: [{ endedAt: null }, { endedAt: { gt: at } }] },
      orderBy: { startedAt: 'desc' },
    });
    if (!row) return null;
    return { status: row.status as PresenceStatus, locationId: row.locationId };
  }

  // Was this person actually able to do a chore scoped to `choreLocationId`
  // (null = family-wide, not tied to one household) at the instant it was
  // due? AWAY/VACATION excuses everything, regardless of location - "away"
  // means not physically able to do ANY chore that day, not just the ones
  // tied to a specific house. HOME only counts for a location-scoped chore
  // if it's the household they were actually AT. No history at all for that
  // instant (see effectiveAt) - never excuse; that's a real miss, unchanged
  // from before this feature existed.
  async wasPresentForChore(userId: string, choreLocationId: string | null, dueDate: Date): Promise<boolean> {
    const eff = await this.effectiveAt(userId, dueDate);
    if (!eff) return true;
    if (eff.status !== 'HOME') return false;
    if (!choreLocationId) return true;
    return eff.locationId === choreLocationId;
  }

  // Ghost/kiosk sessions acting AS an away/vacation person shouldn't be able
  // to buy prizes, claim/complete chores, or spin a wheel on their behalf -
  // the point of those actions is that person doing them, and they're not
  // there. Their own real session (logged in on their own phone/browser) is
  // never gated by this - only sessions someone else is driving.
  async assertActionable(u: { userId: string; ghostedBy?: string; viaKiosk?: boolean }) {
    if (!u.ghostedBy && !u.viaKiosk) return;
    const user = await this.prisma.user.findUnique({
      where: { id: u.userId },
      select: { displayName: true, presenceStatus: true },
    });
    if (user && user.presenceStatus !== 'HOME') {
      throw new ForbiddenException(`${user.displayName} is ${this.label(user.presenceStatus as PresenceStatus)} right now - this can wait until they're back.`);
    }
  }
}
