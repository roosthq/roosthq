import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CalendarsService } from '../calendars/calendars.service';
import { DisplayEventsService } from './display-events.service';
import { LocalCalendarsService } from '../local-calendars/local-calendars.service';

export interface DisplayConfigInput {
  name?: string;
  locationId?: string | null;
  calendarIds?: string[];
  enabledFeatures?: string[];
  theme?: string;
  fontSize?: string;
}

export interface ResolvedConfig {
  id: string | null;
  name: string;
  locationId: string | null;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
  fontSize: string;
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
        fontSize: dto.fontSize ?? 'md',
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
        ...(dto.fontSize !== undefined && { fontSize: dto.fontSize }),
      },
    });
    this.displayEvents.publish(familyId, { type: 'display-updated', id });
    return updated;
  }

  // People assigned to a location (adults: one; kids: possibly several) — or the
  // whole family when the display isn't scoped to a location.
  async membersFor(familyId: string, locationId?: string | null) {
    const users = await this.prisma.user.findMany({
      where: { familyId, ...(locationId ? { locations: { some: { locationId } } } : {}) },
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
    return [...google, ...local];
  }

  private async constrainToLocation(familyId: string, locationId: string | null, calendarIds: string[]): Promise<string[]> {
    if (!locationId || !calendarIds.length) return calendarIds;
    const allowed = new Set((await this.calendarsForLocation(familyId, locationId)).map((c) => c.id));
    return calendarIds.filter((id) => allowed.has(id));
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
        fontSize: 'md',
      };
    }
    return {
      id: null,
      name: 'Display',
      locationId: null,
      calendarIds: [],
      enabledFeatures: ['calendar'],
      theme: 'light',
      fontSize: 'md',
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
      fontSize: string;
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
      fontSize: c.fontSize,
    };
  }

  // Events for a resolved display config.
  async events(familyId: string, config: ResolvedConfig, start?: string, end?: string) {
    if (!config.calendarIds.length) return [];
    const range = start && end ? { start, end } : weekRange();
    return this.calendars.events(familyId, config.calendarIds, range.start, range.end);
  }
}
