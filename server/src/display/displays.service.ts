import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CalendarsService } from '../calendars/calendars.service';
import { DisplayEventsService } from './display-events.service';
import { LocalCalendarsService } from '../local-calendars/local-calendars.service';
import { ChoresService } from '../chores/chores.service';
import { DEFAULT_TIMEZONE, addDaysToKey, endOfDayInZone, startOfDayInZone, todayKeyInZone, type DateKey } from '../common/timezone';
import { HOLIDAYS_CALENDAR_ID, HOLIDAYS_CALENDAR_NAME, HOLIDAYS_CALENDAR_COLOR } from '../holidays/holidays.service';

// Same synthetic entry CalendarsService.listShared appends — kept in sync
// deliberately (both need the exact same id/name/color so a display's
// calendarIds selection round-trips against either picker).
const HOLIDAYS_CALENDAR_ENTRY = {
  id: HOLIDAYS_CALENDAR_ID,
  name: HOLIDAYS_CALENDAR_NAME,
  color: HOLIDAYS_CALENDAR_COLOR,
  source: 'holiday' as const,
};

// An event has "passed" once its end (or start, if it has no end) is
// behind us — all-day events (date-only, no dateTime) never count as
// passed within the day they're already scoped to.
function eventHasPassed(e: Record<string, unknown>, now: Date): boolean {
  const start = e.start as { dateTime?: string; date?: string } | undefined;
  const end = e.end as { dateTime?: string; date?: string } | undefined;
  const endInstant = end?.dateTime ?? (!end?.date ? start?.dateTime : undefined);
  if (!endInstant) return false;
  return new Date(endInstant) < now;
}

function keyToIso(key: DateKey): string {
  return `${key.y}-${String(key.m).padStart(2, '0')}-${String(key.d).padStart(2, '0')}`;
}

export interface DisplayConfigInput {
  name?: string;
  locationId?: string | null;
  calendarIds?: string[];
  enabledFeatures?: string[];
  theme?: string;
  colorTheme?: string;
  soundEffects?: boolean;
  fontSize?: string;
  onScreenKeyboard?: boolean;
  screensaverMinutes?: number;
  weatherLocation?: string | null;
  bedtimeStart?: string | null;
  bedtimeEnd?: string | null;
}

export interface ResolvedConfig {
  id: string | null;
  name: string;
  locationId: string | null;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
  colorTheme: string;
  soundEffects: boolean;
  fontSize: string;
  onScreenKeyboard: boolean;
  screensaverMinutes: number;
  weatherLocation: string | null;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
}

function weekRange(): { start: string; end: string } {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}

@Injectable()
export class DisplaysService {
  constructor(
    private prisma: PrismaService,
    private calendars: CalendarsService,
    private displayEvents: DisplayEventsService,
    private localCalendars: LocalCalendarsService,
    private chores: ChoresService,
  ) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
  }

  private async owned(familyId: string, id: string) {
    const c = await this.prisma.displayConfig.findFirst({ where: { id, familyId } });
    if (!c) throw new NotFoundException('Display not found');
    return c;
  }

  list(familyId: string) {
    return this.prisma.displayConfig.findMany({ where: { familyId }, orderBy: { createdAt: 'asc' } });
  }

  async create(familyId: string, actorId: string, dto: DisplayConfigInput) {
    await this.assertAdult(actorId);
    const locationId = dto.locationId ?? null;
    const calendarIds = await this.constrainToLocation(familyId, locationId, dto.calendarIds ?? []);
    return this.prisma.displayConfig.create({
      data: {
        familyId,
        name: dto.name?.trim() || 'Display',
        locationId,
        calendarIds,
        enabledFeatures: dto.enabledFeatures ?? ['calendar', 'chores'],
        theme: dto.theme ?? 'light',
        colorTheme: dto.colorTheme ?? 'meadow',
        soundEffects: dto.soundEffects ?? true,
        fontSize: dto.fontSize ?? 'md',
        onScreenKeyboard: dto.onScreenKeyboard ?? false,
        screensaverMinutes: Math.max(0, dto.screensaverMinutes ?? 0),
        weatherLocation: dto.weatherLocation?.trim() || null,
        bedtimeStart: dto.bedtimeStart?.trim() || null,
        bedtimeEnd: dto.bedtimeEnd?.trim() || null,
        createdById: actorId,
      },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: DisplayConfigInput) {
    await this.assertAdult(actorId);
    const existing = await this.owned(familyId, id);
    // If the location is changing (or calendars are), re-check calendarIds against
    // whoever is in scope now — a calendar shared only by someone outside the new
    // location shouldn't silently stay selected.
    const locationId = dto.locationId !== undefined ? dto.locationId : existing.locationId;
    const calendarIds =
      dto.calendarIds !== undefined || dto.locationId !== undefined
        ? await this.constrainToLocation(familyId, locationId, dto.calendarIds ?? (existing.calendarIds as string[]) ?? [])
        : undefined;
    const updated = await this.prisma.displayConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(calendarIds !== undefined && { calendarIds }),
        ...(dto.enabledFeatures !== undefined && { enabledFeatures: dto.enabledFeatures }),
        ...(dto.theme !== undefined && { theme: dto.theme }),
        ...(dto.colorTheme !== undefined && { colorTheme: dto.colorTheme }),
        ...(dto.soundEffects !== undefined && { soundEffects: dto.soundEffects }),
        ...(dto.fontSize !== undefined && { fontSize: dto.fontSize }),
        ...(dto.onScreenKeyboard !== undefined && { onScreenKeyboard: dto.onScreenKeyboard }),
        ...(dto.screensaverMinutes !== undefined && { screensaverMinutes: Math.max(0, dto.screensaverMinutes) }),
        ...(dto.weatherLocation !== undefined && { weatherLocation: dto.weatherLocation?.trim() || null }),
        ...(dto.bedtimeStart !== undefined && { bedtimeStart: dto.bedtimeStart?.trim() || null }),
        ...(dto.bedtimeEnd !== undefined && { bedtimeEnd: dto.bedtimeEnd?.trim() || null }),
      },
    });
    this.displayEvents.publish(familyId, { type: 'display', id });
    return updated;
  }

  // Family-wide token balances for the idle profile picker — no signed-in
  // profile needed (same "display token is enough" rule as membersFor
  // below), so a kid's balance is visible on the tap-your-photo screen
  // before anyone's actually unlocked anything.
  balancesFor(familyId: string) {
    return this.chores.balances(familyId);
  }

  // People assigned to a location (adults: one; kids: possibly several) — or the
  // whole family when the display isn't scoped to a location.
  async membersFor(familyId: string, locationId?: string | null) {
    const users = await this.prisma.user.findMany({
      where: { familyId, ...(locationId ? { locations: { some: { locationId } } } : {}) },
      select: { id: true, displayName: true, role: true, avatar: true, pinHash: true, colorTheme: true, tokensDisabled: true, simpleMode: true },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      avatar: u.avatar,
      hasPin: !!u.pinHash,
      colorTheme: u.colorTheme,
      simpleMode: u.simpleMode,
      tokensDisabled: u.tokensDisabled,
    }));
  }

  // Calendars shared by anyone in a location — or every shared family calendar
  // when there's no location scope.
  async calendarsForLocation(familyId: string, locationId?: string | null) {
    const google = await this.prisma.calendar.findMany({
      where: {
        familyId,
        ...(locationId ? { shares: { some: { user: { locations: { some: { locationId } } } } } } : {}),
      },
      select: { id: true, name: true, color: true },
    });
    const local = await this.localCalendars.calendarsForLocation(familyId, locationId);
    return [...google, ...local, HOLIDAYS_CALENDAR_ENTRY];
  }

  private async constrainToLocation(familyId: string, locationId: string | null, calendarIds: string[]): Promise<string[]> {
    if (!locationId || !calendarIds.length) return calendarIds;
    const allowed = new Set((await this.calendarsForLocation(familyId, locationId)).map((c) => c.id));
    return calendarIds.filter((id) => allowed.has(id));
  }

  // Flips this kiosk's own light/dark setting — deliberately reachable with
  // just the display token, no signed-in adult, same as the other physical
  // kiosk controls (screensaver-now, refresh, fullscreen). It's a property of
  // the hardware sitting on the wall, not a family-data mutation, so gating
  // it behind a PIN unlock would just be friction for no safety benefit.
  async setTheme(familyId: string, id: string, theme: string) {
    await this.owned(familyId, id);
    const value = theme === 'dark' ? 'dark' : 'light';
    const updated = await this.prisma.displayConfig.update({ where: { id }, data: { theme: value } });
    this.displayEvents.publish(familyId, { type: 'display', id });
    return updated;
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    await this.prisma.displayConfig.delete({ where: { id } });
    return { ok: true };
  }

  // Resolve which config a kiosk should show: explicit id -> first config ->
  // legacy family display settings -> empty default.
  async resolveConfig(familyId: string, configId?: string | null): Promise<ResolvedConfig> {
    if (configId) {
      const c = await this.prisma.displayConfig.findFirst({ where: { id: configId, familyId } });
      if (c) return this.normalize(familyId, c);
    }
    const first = await this.prisma.displayConfig.findFirst({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    });
    if (first) return this.normalize(familyId, first);

    const legacy = await this.prisma.displaySettings.findUnique({ where: { familyId } });
    if (legacy) {
      return {
        id: null,
        name: 'Display',
        locationId: null,
        calendarIds: (legacy.defaultCalendarIds as string[]) ?? [],
        enabledFeatures: (legacy.enabledFeatures as string[]) ?? ['calendar'],
        theme: legacy.theme,
        colorTheme: 'meadow',
        soundEffects: true,
        fontSize: 'md',
        onScreenKeyboard: false,
        screensaverMinutes: 0,
        weatherLocation: null,
        bedtimeStart: null,
        bedtimeEnd: null,
      };
    }
    return {
      id: null,
      name: 'Display',
      locationId: null,
      calendarIds: [],
      enabledFeatures: ['calendar'],
      theme: 'light',
      colorTheme: 'meadow',
      soundEffects: true,
      fontSize: 'md',
      onScreenKeyboard: false,
      screensaverMinutes: 0,
      weatherLocation: null,
      bedtimeStart: null,
      bedtimeEnd: null,
    };
  }

  // Re-filters calendarIds against the location's current members every time a
  // kiosk resolves its config, so a location/share change elsewhere takes effect
  // immediately instead of waiting for someone to re-save the display.
  private async normalize(
    familyId: string,
    c: {
      id: string;
      name: string;
      locationId: string | null;
      calendarIds: unknown;
      enabledFeatures: unknown;
      theme: string;
      colorTheme: string;
      soundEffects: boolean;
      fontSize: string;
      onScreenKeyboard: boolean;
      screensaverMinutes: number;
      weatherLocation: string | null;
      bedtimeStart: string | null;
      bedtimeEnd: string | null;
    },
  ): Promise<ResolvedConfig> {
    const calendarIds = await this.constrainToLocation(familyId, c.locationId, (c.calendarIds as string[]) ?? []);
    return {
      id: c.id,
      name: c.name,
      locationId: c.locationId,
      calendarIds,
      enabledFeatures: (c.enabledFeatures as string[]) ?? ['calendar'],
      theme: c.theme,
      colorTheme: c.colorTheme,
      soundEffects: c.soundEffects,
      fontSize: c.fontSize,
      onScreenKeyboard: c.onScreenKeyboard,
      screensaverMinutes: c.screensaverMinutes,
      weatherLocation: c.weatherLocation,
      bedtimeStart: c.bedtimeStart,
      bedtimeEnd: c.bedtimeEnd,
    };
  }

  // Events for a resolved display config.
  async events(familyId: string, config: ResolvedConfig, start?: string, end?: string) {
    if (!config.calendarIds.length) return [];
    const range = start && end ? { start, end } : weekRange();
    return this.calendars.events(familyId, config.calendarIds, range.start, range.end);
  }

  // Combined "at a glance" feed for the kiosk's idle screensaver: still-open
  // chores plus calendar events, scoped exactly like the rest of a display's
  // config (location for chores, calendarIds for events) — works with just a
  // display token, no signed-in profile needed.
  //
  // Today's already-passed items are dropped (a chore due at 8am, or an
  // event that already ended, has nothing left to tell you at 9pm). If
  // that leaves today empty, walks forward day by day (capped at 14) for the
  // next day with anything at all, unfiltered — nothing "passed" yet on a
  // day that hasn't happened.
  async todaysSummary(familyId: string, config: ResolvedConfig) {
    // Same fix as ChoresService.dueToday: "today" has to mean the display's
    // own location's wall-clock day, not the server process's ambient UTC —
    // otherwise a naive UTC day boundary shows tomorrow's (or yesterday's)
    // events depending on the hour, for any family not in UTC.
    const tz = config.locationId
      ? (await this.prisma.location.findUnique({ where: { id: config.locationId }, select: { timezone: true } }))?.timezone ||
        DEFAULT_TIMEZONE
      : DEFAULT_TIMEZONE;
    const now = new Date();
    let key = todayKeyInZone(tz);

    for (let offset = 0; offset <= 14; offset++) {
      const isToday = offset === 0;
      const startOfDay = startOfDayInZone(key, tz);
      const endOfDay = endOfDayInZone(key, tz);
      const [chores, rawEvents] = await Promise.all([
        this.chores.dueOnDay(familyId, config.locationId, key, tz, { excludePassed: isToday }),
        this.events(familyId, config, startOfDay.toISOString(), endOfDay.toISOString()),
      ]);
      const events = isToday ? rawEvents.filter((e) => !eventHasPassed(e, now)) : rawEvents;
      if (chores.length || events.length || offset === 14) {
        return { date: keyToIso(key), isToday, chores, events };
      }
      key = addDaysToKey(key, 1);
    }
    // Unreachable (the offset === 14 branch above always returns), but keeps
    // the function's return type honest without a non-null assertion.
    return { date: keyToIso(key), isToday: true, chores: [], events: [] };
  }
}
