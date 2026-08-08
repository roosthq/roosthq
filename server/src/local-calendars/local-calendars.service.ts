import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const REMINDER_LEAD_MINUTES = 60;

export interface LocalCalendarInput {
  name: string;
  color?: string;
  locationId?: string | null;
  image?: string | null;
}

export interface LocalEventInput {
  title: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  start: string; // ISO date (allDay) or datetime
  end: string;
}

// Calendars/events that live entirely in the app — no Google account
// required. CalendarsService merges these into the shared calendar list and
// the aggregated events feed so the rest of the app (filter dropdown, the
// month grid, the kiosk) treats them exactly like a Google calendar.
@Injectable()
export class LocalCalendarsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  private async ownedCalendar(familyId: string, id: string) {
    const c = await this.prisma.localCalendar.findFirst({ where: { id, familyId } });
    if (!c) throw new NotFoundException('Calendar not found');
    return c;
  }

  async create(familyId: string, actorId: string, dto: LocalCalendarInput) {
    await this.assertAdult(actorId);
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    if (dto.locationId) {
      const loc = await this.prisma.location.findFirst({ where: { id: dto.locationId, familyId } });
      if (!loc) throw new BadRequestException('Location not found');
    }
    return this.prisma.localCalendar.create({
      data: {
        familyId,
        name: dto.name.trim(),
        color: dto.color,
        image: dto.image || null,
        locationId: dto.locationId || null,
        createdById: actorId,
      },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: Partial<LocalCalendarInput>) {
    await this.assertAdult(actorId);
    await this.ownedCalendar(familyId, id);
    if (dto.locationId) {
      const loc = await this.prisma.location.findFirst({ where: { id: dto.locationId, familyId } });
      if (!loc) throw new BadRequestException('Location not found');
    }
    return this.prisma.localCalendar.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.image !== undefined && { image: dto.image || null }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId || null }),
      },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    await this.ownedCalendar(familyId, id);
    await this.prisma.localCalendar.delete({ where: { id } });
    return { ok: true };
  }

  // Every local calendar in the family, shaped like SharedCalendar (minus
  // the Google-only fields) — used by CalendarsService.listShared for the
  // owner's unrestricted view.
  async listForFamily(familyId: string) {
    const calendars = await this.prisma.localCalendar.findMany({ where: { familyId } });
    return calendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      image: c.image,
      locationId: c.locationId,
      source: 'local' as const,
    }));
  }

  // Local calendars in scope for a location: the location's own calendars
  // plus every family-wide one (locationId null) — mirrors how a
  // location-scoped kiosk still shows family-wide Google calendars via
  // DisplaysService.calendarsForLocation.
  async calendarsForLocation(familyId: string, locationId?: string | null) {
    const calendars = await this.prisma.localCalendar.findMany({
      where: {
        familyId,
        ...(locationId ? { OR: [{ locationId: null }, { locationId }] } : {}),
      },
    });
    return calendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      image: c.image,
      locationId: c.locationId,
      source: 'local' as const,
    }));
  }

  isLocalId(familyId: string, id: string) {
    return this.prisma.localCalendar.findFirst({ where: { id, familyId } });
  }

  // Same flat shape CalendarsService.events() produces for Google events, so
  // the two can be concatenated and rendered by one calendar grid.
  async eventsFor(calendarIds: string[], timeMin: string, timeMax: string) {
    if (!calendarIds.length) return [];
    const calendars = await this.prisma.localCalendar.findMany({ where: { id: { in: calendarIds } } });
    const calendarById = new Map(calendars.map((c) => [c.id, c]));
    const events = await this.prisma.localEvent.findMany({
      where: {
        localCalendarId: { in: calendarIds },
        startAt: { lt: new Date(timeMax) },
        endAt: { gt: new Date(timeMin) },
      },
      include: { createdBy: { select: { displayName: true } } },
    });
    return events.map((e) => {
      const c = calendarById.get(e.localCalendarId);
      return {
        id: e.id,
        uid: e.id,
        calendarId: e.localCalendarId,
        calendarColor: c?.color ?? undefined,
        calendarName: c?.name ?? undefined,
        // Local events have no Google-account owner to show an avatar for —
        // ownerAvatar is always empty, which left every local event stuck
        // showing the generic "?" fallback. The calendar's own photo (if
        // set) stands in for that instead, same purpose (recognize at a
        // glance whose/which this is).
        ownerAvatar: c?.image ?? undefined,
        title: e.title,
        start: e.allDay ? { date: isoDate(e.startAt) } : { dateTime: e.startAt.toISOString() },
        end: e.allDay ? { date: isoDate(e.endAt) } : { dateTime: e.endAt.toISOString() },
        location: e.location ?? undefined,
        description: e.description ?? undefined,
        addedByUserId: e.createdById,
        addedByName: e.createdBy.displayName,
      };
    });
  }

  private async eventOrThrow(calendarId: string, eventId: string) {
    const event = await this.prisma.localEvent.findFirst({ where: { id: eventId, localCalendarId: calendarId } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async assertCanEdit(familyId: string, actorId: string, createdById: string) {
    const u = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!u || u.familyId !== familyId) throw new ForbiddenException();
    if (!['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role) && u.id !== createdById) {
      throw new ForbiddenException("Only an adult, or whoever added it, can change this event");
    }
  }

  async createEvent(familyId: string, calendarId: string, actorId: string, dto: LocalEventInput) {
    const calendar = await this.ownedCalendar(familyId, calendarId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    const event = await this.prisma.localEvent.create({
      data: {
        localCalendarId: calendarId,
        title: dto.title.trim(),
        description: dto.description || null,
        location: dto.location || null,
        allDay: !!dto.allDay,
        startAt: new Date(dto.start),
        endAt: new Date(dto.end),
        createdById: actorId,
      },
    });
    this.notifyEvent(familyId, calendar.id, calendar.name, actorId, event.title).catch(() => undefined);
    return event;
  }

  async updateEvent(familyId: string, calendarId: string, eventId: string, actorId: string, dto: Partial<LocalEventInput>) {
    await this.ownedCalendar(familyId, calendarId);
    const event = await this.eventOrThrow(calendarId, eventId);
    await this.assertCanEdit(familyId, actorId, event.createdById);
    return this.prisma.localEvent.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description || null }),
        ...(dto.location !== undefined && { location: dto.location || null }),
        ...(dto.allDay !== undefined && { allDay: dto.allDay }),
        ...(dto.start !== undefined && { startAt: new Date(dto.start) }),
        ...(dto.end !== undefined && { endAt: new Date(dto.end) }),
      },
    });
  }

  async deleteEvent(familyId: string, calendarId: string, eventId: string, actorId: string) {
    await this.ownedCalendar(familyId, calendarId);
    const event = await this.eventOrThrow(calendarId, eventId);
    await this.assertCanEdit(familyId, actorId, event.createdById);
    await this.prisma.localEvent.delete({ where: { id: eventId } });
    return { ok: true };
  }

  // Same "adults always, kids only if it's on one of their location's kiosks"
  // rule as CalendarsService.notifyCalendarEvent, kept in sync deliberately.
  private async notifyEvent(familyId: string, calendarId: string, calendarName: string, addedByUserId: string, title: string) {
    const adder = await this.prisma.user.findUnique({ where: { id: addedByUserId } });
    const notifTitle = `${adder?.displayName ?? 'Someone'} added "${title}" to ${calendarName}`;
    await this.notifications.notifyAdults(familyId, 'CALENDAR_EVENT_ADDED', notifTitle, {
      link: '/',
      excludeUserId: addedByUserId,
    });

    const kidIds = await this.kidsInScope(familyId, calendarId);
    await Promise.all(
      kidIds.map((id) => this.notifications.create(familyId, id, 'CALENDAR_EVENT_ADDED', notifTitle, { link: '/' })),
    );
  }

  // Which kids can actually see this calendar — it's on a kiosk display
  // scoped to one of their locations. Adults/owner always see every local
  // calendar, so they don't need this check.
  private async kidsInScope(familyId: string, calendarId: string): Promise<string[]> {
    const displays = await this.prisma.displayConfig.findMany({ where: { familyId } });
    const locationIds = new Set<string>();
    for (const d of displays) {
      const ids = (d.calendarIds as string[]) ?? [];
      if (d.locationId && ids.includes(calendarId)) locationIds.add(d.locationId);
    }
    if (!locationIds.size) return [];
    const kids = await this.prisma.user.findMany({
      where: { familyId, role: 'KID', locations: { some: { locationId: { in: [...locationIds] } } } },
      select: { id: true },
    });
    return kids.map((k) => k.id);
  }

  // "Starting soon" reminder for timed events (all-day events aren't covered —
  // there's no location timezone plumbed through here to know what "morning
  // of" means for them). Fires once per event via remindedAt, same
  // never-double-send pattern as ChoresService.pollDueDates' warnedThreshold.
  @Interval(60_000)
  async pollUpcomingEvents() {
    const now = new Date();
    const horizon = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);
    const due = await this.prisma.localEvent.findMany({
      where: { allDay: false, remindedAt: null, startAt: { gte: now, lte: horizon } },
      include: { calendar: true },
    });
    for (const event of due) {
      await this.prisma.localEvent.update({ where: { id: event.id }, data: { remindedAt: now } });
      const minutes = Math.round((event.startAt.getTime() - now.getTime()) / 60_000);
      const label = minutes >= 60 ? `${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
      const title = `"${event.title}" starts in ${label}`;
      const kidIds = await this.kidsInScope(event.calendar.familyId, event.calendar.id);
      await this.notifications.notifyAdults(event.calendar.familyId, 'CALENDAR_EVENT_REMINDER', title, { link: '/' });
      await Promise.all(
        kidIds.map((id) => this.notifications.create(event.calendar.familyId, id, 'CALENDAR_EVENT_REMINDER', title, { link: '/' })),
      );
    }
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
