import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DisplayEventsService } from '../display/display-events.service';
import { assertKidPermission } from '../common/kid-permissions';
import { DEFAULT_TIMEZONE, todayKeyInZone } from '../common/timezone';
import { assertFeatureEnabled, isFeatureEnabled, sanitizeDisabledFeatures } from '../common/features';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Meals / grocery / countdowns / announcements - the "kitchen wall" extras -
// plus the weekly automation crons (digest, allowance). All family-scoped;
// which of them a family actually uses is governed by Family.disabledFeatures
// (checked here for the crons; the UI gates the widgets).
@Injectable()
export class HouseholdService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
  ) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
  }

  private async assertLocation(familyId: string, locationId?: string | null) {
    if (!locationId) return null;
    const loc = await this.prisma.location.findFirst({ where: { id: locationId, familyId } });
    if (!loc) throw new BadRequestException('Location not found');
    return locationId;
  }

  // The standard household scoping rule (same as chores/local calendars): a
  // location sees its own items PLUS family-wide (locationId null) ones.
  // 'none' = strictly family-wide items (the Household page's Family-wide
  // tab); no filter at all = everything (kiosk bundles for unscoped displays).
  private scope(locationId?: string | null) {
    if (locationId === 'none') return { locationId: null };
    return locationId ? { OR: [{ locationId: null }, { locationId }] } : {};
  }

  // Same rule chores.service.ts uses: a location's own timezone, falling
  // back to the instance default for anything family-wide/unscoped. "Today"
  // for the kitchen wall has to mean today where that kitchen actually is,
  // not wherever the server container's clock happens to be (UTC, in
  // practice) - that's what was showing tomorrow's dinner on the kiosk
  // during evening hours in any zone west of UTC.
  private async resolveTimezone(locationId?: string | null): Promise<string> {
    if (!locationId) return DEFAULT_TIMEZONE;
    const loc = await this.prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
    return loc?.timezone || DEFAULT_TIMEZONE;
  }

  // Thin wrapper so existing call sites below don't all need editing -
  // shared with chores.service.ts via common/features.ts.
  private featureEnabled(familyId: string, feature: string) {
    return isFeatureEnabled(this.prisma, familyId, feature);
  }

  // ---- Meals ----

  // Flatten the eatOutPlace relation into a plain name - callers/the client
  // type (MealPlanEntry) never need the nested object, just its name.
  private mapMeal<T extends { eatOutPlace?: { name: string } | null }>(m: T) {
    const { eatOutPlace, ...rest } = m;
    return { ...rest, eatOutPlaceName: eatOutPlace?.name ?? null };
  }

  async meals(familyId: string, start: string, end: string, locationId?: string | null) {
    if (!(await this.featureEnabled(familyId, 'meals'))) return [];
    return this.prisma.mealPlan
      .findMany({
        where: { familyId, date: { gte: start, lte: end }, ...this.scope(locationId) },
        include: { eatOutPlace: { select: { name: true } } },
        orderBy: { date: 'asc' },
      })
      .then((rows) => rows.map((r) => this.mapMeal(r)));
  }

  // One dinner per day PER SCOPE (family-wide vs each household) - enforced
  // here since MySQL can't unique-index a nullable locationId usefully.
  async setMeal(
    familyId: string,
    actorId: string,
    date: string,
    dto: { title?: string; notes?: string | null; locationId?: string | null; isEatingOut?: boolean; eatOutPlaceId?: string | null },
  ) {
    await assertFeatureEnabled(this.prisma, familyId, 'meals');
    await this.assertAdult(actorId);
    if (!DATE_KEY.test(date)) throw new BadRequestException('Bad date');
    const isEatingOut = !!dto.isEatingOut;
    // A dish name is required for a normal dinner, but meaningless for an
    // "Out" night - default it to something readable rather than force the
    // caller to make one up (the UI never even shows a title field for Out).
    const title = isEatingOut ? dto.title?.trim() || 'Out' : dto.title?.trim();
    if (!title) throw new BadRequestException('Title is required');
    const locationId = await this.assertLocation(familyId, dto.locationId);
    let eatOutPlaceId: string | null | undefined = undefined;
    if (dto.eatOutPlaceId !== undefined) {
      if (dto.eatOutPlaceId === null) {
        eatOutPlaceId = null;
      } else {
        const place = await this.prisma.eatOutPlace.findFirst({ where: { id: dto.eatOutPlaceId, familyId } });
        if (!place) throw new BadRequestException('Place not found');
        eatOutPlaceId = place.id;
      }
    }
    const existing = await this.prisma.mealPlan.findFirst({ where: { familyId, date, locationId } });
    const meal = existing
      ? await this.prisma.mealPlan.update({
          where: { id: existing.id },
          data: {
            title,
            isEatingOut,
            // Switching a day back to a normal dinner clears whatever place
            // was picked - otherwise it'd silently reappear if "Out" got
            // re-checked later.
            eatOutPlaceId: isEatingOut ? eatOutPlaceId : null,
            ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
          },
          include: { eatOutPlace: { select: { name: true } } },
        })
      : await this.prisma.mealPlan.create({
          data: {
            familyId,
            date,
            title,
            locationId,
            isEatingOut,
            eatOutPlaceId: isEatingOut ? (eatOutPlaceId ?? null) : null,
            notes: dto.notes?.trim() || null,
          },
          include: { eatOutPlace: { select: { name: true } } },
        });
    this.displayEvents.publish(familyId, { type: 'household' });
    return this.mapMeal(meal);
  }

  async deleteMeal(familyId: string, actorId: string, date: string, locationId?: string | null) {
    await assertFeatureEnabled(this.prisma, familyId, 'meals');
    await this.assertAdult(actorId);
    await this.prisma.mealPlan.deleteMany({ where: { familyId, date, locationId: locationId || null } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Out-to-eat picker ----
  // A household-maintained list of favorite places (same family-wide-vs-house
  // scoping as grocery/countdowns/announcements below); "spinning" a day
  // picks one uniformly at random. Same fairness rule as everywhere else with
  // a random payout: the server rolls, the client only ever finds out the
  // result - there's no client-suppliable "which place did I get" input here.

  async eatOutPlaces(familyId: string, locationId?: string | null) {
    if (!(await this.featureEnabled(familyId, 'meals'))) return [];
    return this.prisma.eatOutPlace.findMany({ where: { familyId, ...this.scope(locationId) }, orderBy: { name: 'asc' } });
  }

  async addEatOutPlace(familyId: string, actorId: string, dto: { name: string; notes?: string | null; locationId?: string | null }) {
    await assertFeatureEnabled(this.prisma, familyId, 'meals');
    await this.assertAdult(actorId);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Name is required');
    const locationId = await this.assertLocation(familyId, dto.locationId);
    return this.prisma.eatOutPlace.create({
      data: { familyId, locationId, name: name.slice(0, 120), notes: dto.notes?.trim() || null, createdById: actorId },
    });
  }

  async updateEatOutPlace(familyId: string, actorId: string, id: string, dto: { name?: string; notes?: string | null; locationId?: string | null }) {
    await this.assertAdult(actorId);
    const place = await this.prisma.eatOutPlace.findFirst({ where: { id, familyId } });
    if (!place) throw new NotFoundException('Place not found');
    const locationId = dto.locationId !== undefined ? await this.assertLocation(familyId, dto.locationId) : undefined;
    return this.prisma.eatOutPlace.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim().slice(0, 120) || place.name }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        ...(locationId !== undefined && { locationId }),
      },
    });
  }

  async deleteEatOutPlace(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    const place = await this.prisma.eatOutPlace.findFirst({ where: { id, familyId } });
    if (!place) throw new NotFoundException('Place not found');
    await this.prisma.eatOutPlace.delete({ where: { id } });
    return { ok: true };
  }

  // Picks a place for an already-"Out" day. Creates the day as Out if it
  // doesn't exist yet (spinning implies wanting to eat out that day even if
  // nobody explicitly toggled it on first). Spins among this house's own
  // places plus whatever's family-wide - same merge rule as reading them.
  async spinEatOut(familyId: string, actorId: string, date: string, locationId?: string | null) {
    await assertFeatureEnabled(this.prisma, familyId, 'meals');
    await this.assertAdult(actorId);
    if (!DATE_KEY.test(date)) throw new BadRequestException('Bad date');
    const resolvedLocationId = await this.assertLocation(familyId, locationId);
    const places = await this.prisma.eatOutPlace.findMany({ where: { familyId, ...this.scope(resolvedLocationId) } });
    if (!places.length) throw new BadRequestException('Add at least one place first');
    const winner = places[Math.floor(Math.random() * places.length)];
    const existing = await this.prisma.mealPlan.findFirst({ where: { familyId, date, locationId: resolvedLocationId } });
    const meal = existing
      ? await this.prisma.mealPlan.update({
          where: { id: existing.id },
          data: { isEatingOut: true, eatOutPlaceId: winner.id },
          include: { eatOutPlace: { select: { name: true } } },
        })
      : await this.prisma.mealPlan.create({
          data: { familyId, date, title: 'Out', locationId: resolvedLocationId, isEatingOut: true, eatOutPlaceId: winner.id },
          include: { eatOutPlace: { select: { name: true } } },
        });
    this.displayEvents.publish(familyId, { type: 'household' });
    return this.mapMeal(meal);
  }

  // ---- Grocery list ----
  // Anyone in the family can add/check/remove - it's the fridge notepad.

  async grocery(familyId: string, locationId?: string | null) {
    if (!(await this.featureEnabled(familyId, 'grocery'))) return [];
    return this.prisma.groceryItem.findMany({
      where: { familyId, ...this.scope(locationId) },
      orderBy: [{ checked: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async addGrocery(familyId: string, actorId: string, label: string, locationId?: string | null) {
    await assertFeatureEnabled(this.prisma, familyId, 'grocery');
    await assertKidPermission(this.prisma, actorId, 'grocery');
    const trimmed = label?.trim();
    if (!trimmed) throw new BadRequestException('Item is required');
    const item = await this.prisma.groceryItem.create({
      data: { familyId, label: trimmed.slice(0, 120), addedById: actorId, locationId: await this.assertLocation(familyId, locationId) },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return item;
  }

  async patchGrocery(familyId: string, actorId: string, id: string, dto: { checked?: boolean; label?: string }) {
    await assertFeatureEnabled(this.prisma, familyId, 'grocery');
    await assertKidPermission(this.prisma, actorId, 'grocery');
    const item = await this.prisma.groceryItem.findFirst({ where: { id, familyId } });
    if (!item) throw new NotFoundException('Item not found');
    const updated = await this.prisma.groceryItem.update({
      where: { id },
      data: {
        ...(dto.checked !== undefined && { checked: dto.checked, checkedAt: dto.checked ? new Date() : null }),
        ...(dto.label !== undefined && { label: dto.label.trim().slice(0, 120) || item.label }),
      },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return updated;
  }

  async deleteGrocery(familyId: string, actorId: string, id: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'grocery');
    await assertKidPermission(this.prisma, actorId, 'grocery');
    const item = await this.prisma.groceryItem.findFirst({ where: { id, familyId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.groceryItem.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  async clearCheckedGrocery(familyId: string, locationId?: string | null) {
    await this.prisma.groceryItem.deleteMany({ where: { familyId, checked: true, ...this.scope(locationId) } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Countdowns ----

  async countdowns(familyId: string, locationId?: string | null) {
    if (!(await this.featureEnabled(familyId, 'countdowns'))) return [];
    return this.prisma.countdown.findMany({ where: { familyId, ...this.scope(locationId) }, orderBy: { date: 'asc' } });
  }

  async addCountdown(
    familyId: string,
    actorId: string,
    dto: { title: string; date: string; emoji?: string; locationId?: string | null },
  ) {
    await assertFeatureEnabled(this.prisma, familyId, 'countdowns');
    await this.assertAdult(actorId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    if (!DATE_KEY.test(dto.date ?? '')) throw new BadRequestException('Bad date');
    const c = await this.prisma.countdown.create({
      data: { familyId, title: dto.title.trim(), date: dto.date, emoji: dto.emoji?.trim() || '🎉', locationId: await this.assertLocation(familyId, dto.locationId) },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return c;
  }

  async deleteCountdown(familyId: string, actorId: string, id: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'countdowns');
    await this.assertAdult(actorId);
    const c = await this.prisma.countdown.findFirst({ where: { id, familyId } });
    if (!c) throw new NotFoundException('Countdown not found');
    await this.prisma.countdown.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Announcements ----

  async announcements(familyId: string, locationId?: string | null) {
    if (!(await this.featureEnabled(familyId, 'announcements'))) return [];
    return this.prisma.announcement.findMany({
      where: {
        familyId,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, this.scope(locationId)],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAnnouncement(
    familyId: string,
    actorId: string,
    dto: { text: string; expiresInHours?: number; locationId?: string | null },
  ) {
    await assertFeatureEnabled(this.prisma, familyId, 'announcements');
    await this.assertAdult(actorId);
    if (!dto.text?.trim()) throw new BadRequestException('Text is required');
    const expiresAt =
      dto.expiresInHours && dto.expiresInHours > 0
        ? new Date(Date.now() + dto.expiresInHours * 3_600_000)
        : null;
    const a = await this.prisma.announcement.create({
      data: { familyId, text: dto.text.trim().slice(0, 500), createdById: actorId, expiresAt, locationId: await this.assertLocation(familyId, dto.locationId) },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return a;
  }

  async deleteAnnouncement(familyId: string, actorId: string, id: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'announcements');
    await this.assertAdult(actorId);
    const a = await this.prisma.announcement.findFirst({ where: { id, familyId } });
    if (!a) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Kiosk bundle: everything the display widgets need in one call ----

  // locationId = the display's own household scope, so a kiosk at dad's
  // house shows dad's-house dinner, not mom's.
  async displayBundle(familyId: string, locationId?: string | null) {
    const tz = await this.resolveTimezone(locationId);
    const key = todayKeyInZone(tz);
    const today = `${key.y}-${String(key.m).padStart(2, '0')}-${String(key.d).padStart(2, '0')}`;

    const fam = await this.prisma.family.findUnique({ where: { id: familyId }, select: { disabledFeatures: true } });
    const disabled = sanitizeDisabledFeatures(fam?.disabledFeatures);
    if (disabled.includes('household')) return { today, meals: [], countdowns: [], announcements: [], groceryOpen: 0 };
    const on = (f: string) => !disabled.includes(f);

    const [mealRows, countdownRows, announcements, groceryOpen, people] = await Promise.all([
      on('meals')
        ? this.prisma.mealPlan.findMany({
            where: { familyId, date: { gte: today }, ...this.scope(locationId) },
            include: { eatOutPlace: { select: { name: true } } },
            orderBy: { date: 'asc' },
            take: 3,
          })
        : Promise.resolve([]),
      on('countdowns')
        ? this.prisma.countdown.findMany({
            where: { familyId, date: { gte: today }, ...this.scope(locationId) },
            orderBy: { date: 'asc' },
            take: 4,
          })
        : Promise.resolve([]),
      on('announcements')
        ? this.prisma.announcement.findMany({
            where: {
              familyId,
              AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, this.scope(locationId)],
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
          })
        : Promise.resolve([]),
      on('grocery') ? this.prisma.groceryItem.count({ where: { familyId, checked: false, ...this.scope(locationId) } }) : Promise.resolve(0),
      on('countdowns')
        ? this.prisma.user.findMany({ where: { familyId, birthday: { not: null } }, select: { displayName: true, birthday: true } })
        : Promise.resolve([]),
    ]);
    // Birthdays inside the next 60 days ride along as synthetic countdowns
    // (family-wide by nature - a birthday belongs to the person, not a house).
    const withBirthdays = [...countdownRows];
    for (const person of people) {
      const next = nextBirthday(person.birthday!, today);
      if (next && daysBetween(today, next) <= 60) {
        withBirthdays.push({
          id: `bday-${person.displayName}`,
          familyId,
          locationId: null,
          title: `${person.displayName}'s birthday`,
          emoji: '🎂',
          date: next,
          createdAt: new Date(),
        });
      }
    }
    withBirthdays.sort((a, b) => a.date.localeCompare(b.date));
    const meals = mealRows.map((r) => this.mapMeal(r));
    return { today, meals, countdowns: withBirthdays.slice(0, 4), announcements, groceryOpen };
  }

  // ---- Weekly automation ----

  // Weekly allowance: every Monday morning, grant each person's configured
  // allowanceTokens - unless the family turned the feature off.
  @Cron('0 7 * * 1')
  async allowanceCron() {
    const users = await this.prisma.user.findMany({
      where: { allowanceTokens: { gt: 0 }, tokensDisabled: false },
      select: { id: true, familyId: true, allowanceTokens: true },
    });
    for (const u of users) {
      if (!(await this.featureEnabled(u.familyId, 'allowance'))) continue;
      await this.prisma.tokenLedger.create({
        data: { userId: u.id, delta: u.allowanceTokens, reason: 'Weekly allowance', type: 'MANUAL', createdById: u.id },
      });
      await this.notifications.create(u.familyId, u.id, 'STREAK_BONUS', `Weekly allowance: +${u.allowanceTokens}`, {
        link: '/profile',
      });
      this.displayEvents.publish(u.familyId, { type: 'chores' });
    }
  }

  // Weekly digest: Sunday evening, tell the adults how the week went -
  // approved chore counts and tokens earned per person.
  @Cron('0 18 * * 0')
  async digestCron() {
    const families = await this.prisma.family.findMany({ select: { id: true, disabledFeatures: true } });
    const since = new Date(Date.now() - 7 * 86_400_000);
    for (const fam of families) {
      const disabled = Array.isArray(fam.disabledFeatures) ? (fam.disabledFeatures as string[]) : [];
      if (disabled.includes('digest')) continue;
      const members = await this.prisma.user.findMany({
        where: { familyId: fam.id },
        select: { id: true, displayName: true },
      });
      const parts: string[] = [];
      for (const m of members) {
        const [approved, earned] = await Promise.all([
          this.prisma.choreInstance.count({
            where: { chore: { familyId: fam.id }, claimedByUserId: m.id, status: 'APPROVED', completedAt: { gte: since } },
          }),
          this.prisma.tokenLedger.aggregate({
            where: { userId: m.id, delta: { gt: 0 }, createdAt: { gte: since } },
            _sum: { delta: true },
          }),
        ]);
        if (approved > 0 || (earned._sum.delta ?? 0) > 0) {
          parts.push(`${m.displayName}: ${approved} done, +${earned._sum.delta ?? 0}`);
        }
      }
      if (!parts.length) continue;
      await this.notifications.notifyAdults(fam.id, 'STREAK_BONUS', `This week: ${parts.join(' · ')}`, { link: '/chores' });
    }
  }
}

// Next occurrence of a MM-DD on/after `fromKey` (handles year rollover).
function nextBirthday(birthday: string, fromKey: string): string | null {
  const m = birthday.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(fromKey.slice(0, 4));
  const thisYear = `${year}-${m[1]}-${m[2]}`;
  return thisYear >= fromKey ? thisYear : `${year + 1}-${m[1]}-${m[2]}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
}
