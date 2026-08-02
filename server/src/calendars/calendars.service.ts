import { Injectable, NotFoundException } from '@nestjs/common';
import { calendar_v3 } from 'googleapis';
import { PrismaService } from '../prisma.service';
import { GoogleService } from '../google/google.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LocalCalendarsService, LocalEventInput } from '../local-calendars/local-calendars.service';
import { zonedTimeToUtc } from '../common/timezone';
import { DisplayEventsService } from '../display/display-events.service';

export interface ShareSelection {
  googleCalendarId: string;
  name: string;
  color?: string;
}

@Injectable()
export class CalendarsService {
  constructor(
    private prisma: PrismaService,
    private google: GoogleService,
    private notifications: NotificationsService,
    private localCalendars: LocalCalendarsService,
    private displayEvents: DisplayEventsService,
  ) {}

  // Google calendars available across the user's connected accounts (the
  // picker) — only ones this account actually owns (or has been granted
  // owner-level access to, which covers a deliberately shared household
  // calendar), not just anything merely shared to them read/write. Sharing
  // someone else's personal calendar into the family by accident isn't the
  // point; sharing your own, or a calendar you're a real co-owner of, is.
  //
  // One dead account (expired Google token) shouldn't blank the whole picker
  // for every other connected account — skip it and mark it for reconnect
  // instead of throwing for the whole request.
  async listGoogleCalendars(userId: string) {
    const accounts = await this.prisma.googleAccount.findMany({ where: { userId } });
    const out: Array<{
      googleAccountId: string;
      googleCalendarId: string;
      name: string;
      color?: string;
      primary: boolean;
    }> = [];
    for (const acc of accounts) {
      try {
        const { data } = await this.google.withCalendar(acc.id, (cal) => cal.calendarList.list());
        for (const item of data.items ?? []) {
          if (item.accessRole !== 'owner') continue;
          out.push({
            googleAccountId: acc.id,
            googleCalendarId: item.id as string,
            name: item.summary ?? '(untitled)',
            color: item.backgroundColor ?? undefined,
            primary: item.primary ?? false,
          });
        }
      } catch {
        // Already marked needsReconnect by withCalendar; this account's
        // calendars just don't show up until it's reconnected.
      }
    }
    return out;
  }

  // Whether any of this user's connected Google accounts need reconnecting —
  // so the calendar page can show that proactively instead of only after a
  // click silently does nothing.
  async accountStatus(userId: string) {
    const accounts = await this.prisma.googleAccount.findMany({ where: { userId }, select: { needsReconnect: true } });
    return { needsReconnect: accounts.some((a) => a.needsReconnect) };
  }

  // Share selected calendars into the family. Dedup on [familyId, googleCalendarId]:
  // the same calendar shared by two members is stored once.
  async share(
    familyId: string,
    userId: string,
    googleAccountId: string,
    selections: ShareSelection[],
  ) {
    const results = [];
    for (const sel of selections) {
      const calendar = await this.prisma.calendar.upsert({
        where: { familyId_googleCalendarId: { familyId, googleCalendarId: sel.googleCalendarId } },
        update: { name: sel.name, color: sel.color },
        create: {
          familyId,
          googleAccountId,
          googleCalendarId: sel.googleCalendarId,
          name: sel.name,
          color: sel.color,
        },
      });
      await this.prisma.calendarShare.upsert({
        where: { calendarId_userId: { calendarId: calendar.id, userId } },
        update: {},
        create: { calendarId: calendar.id, userId },
      });
      results.push(calendar);
    }
    return results;
  }

  // Remove my own share of a calendar. If nobody else in the family still
  // shares it, drop the Calendar row entirely instead of leaving a zombie
  // entry with a 0 share count.
  async unshare(familyId: string, userId: string, googleCalendarId: string) {
    const calendar = await this.prisma.calendar.findUnique({
      where: { familyId_googleCalendarId: { familyId, googleCalendarId } },
    });
    if (!calendar) return { ok: true };
    await this.prisma.calendarShare.deleteMany({ where: { calendarId: calendar.id, userId } });
    const remaining = await this.prisma.calendarShare.count({ where: { calendarId: calendar.id } });
    if (remaining === 0) {
      await this.prisma.calendar.delete({ where: { id: calendar.id } });
    }
    return { ok: true };
  }

  // Shared calendars for the family, with share counts and whether the current user shared it.
  async listShared(familyId: string, userId: string) {
    const calendars = await this.prisma.calendar.findMany({
      where: { familyId },
      include: { shares: true },
    });
    const google = calendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      googleCalendarId: c.googleCalendarId,
      shareCount: c.shares.length,
      sharedByMe: c.shares.some((s) => s.userId === userId),
      source: 'google' as const,
    }));
    const local = await this.localCalendars.listForFamily(familyId);
    return [...google, ...local];
  }

  // Aggregate events across selected shared calendars, deduped by iCalUID so the
  // same event on two shared calendars only appears once.
  async events(familyId: string, calendarIds: string[], timeMin: string, timeMax: string) {
    const calendars = await this.prisma.calendar.findMany({
      where: { familyId, id: { in: calendarIds } },
      include: { googleAccount: { include: { user: true } } },
    });
    const googleIds = new Set(calendars.map((c) => c.id));
    const localIds = calendarIds.filter((id) => !googleIds.has(id));
    const byUid = new Map<string, Record<string, unknown> & { addedByUserId?: string; addedByName?: string }>();
    for (const c of calendars) {
      const owner = c.googleAccount?.user;
      let items: calendar_v3.Schema$Event[];
      try {
        const { data } = await this.google.withCalendar(c.googleAccountId, (cal) =>
          cal.events.list({
            calendarId: c.googleCalendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
          }),
        );
        items = data.items ?? [];
      } catch {
        // This calendar's account needs reconnecting (already marked) — skip
        // just its events rather than failing the whole aggregated view.
        continue;
      }
      for (const ev of items) {
        const uid = ev.iCalUID ?? `${c.id}:${ev.id}`;
        if (!byUid.has(uid)) {
          const addedByUserId = (ev.extendedProperties?.private as Record<string, string> | undefined)?.roostHqAddedBy;
          byUid.set(uid, {
            id: ev.id,
            uid,
            calendarId: c.id,
            calendarColor: c.color,
            calendarName: c.name,
            ownerName: owner?.displayName ?? undefined,
            ownerAvatar: owner?.avatar ?? undefined,
            title: ev.summary,
            start: ev.start,
            end: ev.end,
            location: ev.location,
            description: ev.description,
            addedByUserId,
          });
        }
      }
    }
    const events = Array.from(byUid.values());
    const localEvents = await this.localCalendars.eventsFor(localIds, timeMin, timeMax);
    events.push(...localEvents);

    // Resolve "added by" to a display name — a separate identity from the
    // calendar's owner (whose Google account it is), added by whoever actually
    // used the app to create it.
    const addedByIds = [...new Set(events.map((e) => e.addedByUserId).filter((v): v is string => !!v))];
    if (addedByIds.length) {
      const addedByUsers = await this.prisma.user.findMany({
        where: { id: { in: addedByIds }, familyId },
        select: { id: true, displayName: true },
      });
      const nameById = new Map(addedByUsers.map((u) => [u.id, u.displayName]));
      for (const e of events) {
        if (e.addedByUserId) e.addedByName = nameById.get(e.addedByUserId);
      }
    }
    return events;
  }

  private async calendarOrThrow(familyId: string, calendarId: string) {
    const cal = await this.prisma.calendar.findFirst({ where: { id: calendarId, familyId } });
    if (!cal) throw new NotFoundException('Calendar not found');
    return cal;
  }

  // A calendarId in these routes may point at a Google-backed Calendar or a
  // LocalCalendar — the frontend (AddEventModal, the kiosk) doesn't know or
  // care which, it just posts to `/calendars/:calendarId/events`.
  // A timed dateTime here is a naive "YYYY-MM-DDTHH:mm:ss" plus a separate
  // timeZone field (how AddEventModal builds it, mirroring Google's event
  // resource shape) — NOT an ISO instant. `new Date(...)` on a string with no
  // offset parses as the JS runtime's local time, which inside the Docker
  // container is UTC, not the browser's zone — so every timed local event
  // would land 6-7 hours off for anyone not in UTC. Resolve it properly here
  // before it ever reaches LocalCalendarsService.
  private resolveDateTime(v: { date?: string; dateTime?: string; timeZone?: string } | undefined): string | undefined {
    if (!v) return undefined;
    if (v.date) return v.date;
    if (!v.dateTime) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(v.dateTime);
    if (!m) return v.dateTime;
    const [, y, mo, d, hh, mm, ss] = m.map(Number);
    return zonedTimeToUtc(y, mo, d, hh, mm, ss, 0, v.timeZone || 'UTC').toISOString();
  }

  private googleBodyToLocalInput(body: Record<string, unknown>): Partial<LocalEventInput> {
    const start = body.start as { date?: string; dateTime?: string; timeZone?: string } | undefined;
    const end = body.end as { date?: string; dateTime?: string; timeZone?: string } | undefined;
    const allDay = start ? !!start.date : undefined;
    const out: Partial<LocalEventInput> = {};
    if (body.summary !== undefined) out.title = body.summary as string;
    if (body.description !== undefined) out.description = body.description as string;
    if (body.location !== undefined) out.location = body.location as string;
    if (allDay !== undefined) out.allDay = allDay;
    if (start) out.start = this.resolveDateTime(start);
    if (end) out.end = this.resolveDateTime(end);
    return out;
  }

  // body is a Google Calendar event resource (summary, start, end, location, ...).
  // addedByUserId is stamped into extendedProperties so events created through
  // the app can show who added them — separate from the calendar's own Google
  // account owner.
  async createEvent(familyId: string, calendarId: string, addedByUserId: string, body: Record<string, unknown>) {
    if (await this.localCalendars.isLocalId(familyId, calendarId)) {
      const created = await this.localCalendars.createEvent(
        familyId,
        calendarId,
        addedByUserId,
        this.googleBodyToLocalInput(body) as LocalEventInput,
      );
      this.displayEvents.publish(familyId, { type: 'calendar' });
      return created;
    }
    const c = await this.calendarOrThrow(familyId, calendarId);
    const { data } = await this.google.withCalendar(c.googleAccountId, (cal) =>
      cal.events.insert({
        calendarId: c.googleCalendarId,
        requestBody: { ...body, extendedProperties: { private: { roostHqAddedBy: addedByUserId } } } as never,
      }),
    );
    this.notifyCalendarEvent(familyId, c.id, c.name, addedByUserId, (body.summary as string) ?? 'an event').catch(() => undefined);
    this.displayEvents.publish(familyId, { type: 'calendar' });
    return data;
  }

  // Adults always get notified (mirrors them generally seeing the whole family
  // calendar); a kid only gets notified if the calendar is actually on one of
  // their own location's kiosk displays — same rule that governs what they can
  // see in the app in the first place.
  private async notifyCalendarEvent(
    familyId: string,
    calendarId: string,
    calendarName: string,
    addedByUserId: string,
    summary: string,
  ) {
    const adder = await this.prisma.user.findUnique({ where: { id: addedByUserId } });
    const title = `${adder?.displayName ?? 'Someone'} added "${summary}" to ${calendarName}`;
    await this.notifications.notifyAdults(familyId, 'CALENDAR_EVENT_ADDED', title, {
      link: '/',
      excludeUserId: addedByUserId,
    });

    const displays = await this.prisma.displayConfig.findMany({ where: { familyId } });
    const locationIds = new Set<string>();
    for (const d of displays) {
      const ids = (d.calendarIds as string[]) ?? [];
      if (d.locationId && ids.includes(calendarId)) locationIds.add(d.locationId);
    }
    if (!locationIds.size) return;
    const kids = await this.prisma.user.findMany({
      where: { familyId, role: 'KID', locations: { some: { locationId: { in: [...locationIds] } } } },
    });
    await Promise.all(
      kids.map((k) => this.notifications.create(familyId, k.id, 'CALENDAR_EVENT_ADDED', title, { link: '/' })),
    );
  }

  async updateEvent(
    familyId: string,
    calendarId: string,
    eventId: string,
    actorId: string,
    body: Record<string, unknown>,
  ) {
    if (await this.localCalendars.isLocalId(familyId, calendarId)) {
      const updated = await this.localCalendars.updateEvent(familyId, calendarId, eventId, actorId, this.googleBodyToLocalInput(body));
      this.displayEvents.publish(familyId, { type: 'calendar' });
      return updated;
    }
    const c = await this.calendarOrThrow(familyId, calendarId);
    const { data } = await this.google.withCalendar(c.googleAccountId, (cal) =>
      cal.events.patch({
        calendarId: c.googleCalendarId,
        eventId,
        requestBody: body as never,
      }),
    );
    this.displayEvents.publish(familyId, { type: 'calendar' });
    return data;
  }

  async deleteEvent(familyId: string, calendarId: string, eventId: string, actorId: string) {
    if (await this.localCalendars.isLocalId(familyId, calendarId)) {
      const removed = await this.localCalendars.deleteEvent(familyId, calendarId, eventId, actorId);
      this.displayEvents.publish(familyId, { type: 'calendar' });
      return removed;
    }
    const c = await this.calendarOrThrow(familyId, calendarId);
    await this.google.withCalendar(c.googleAccountId, (cal) =>
      cal.events.delete({
        calendarId: c.googleCalendarId,
        eventId,
      }),
    );
    this.displayEvents.publish(familyId, { type: 'calendar' });
    return { ok: true };
  }
}
