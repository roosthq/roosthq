import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { calendar_v3 } from 'googleapis';
import { PrismaService } from '../prisma.service';
import { assertKidPermission } from '../common/kid-permissions';
import { GoogleService } from '../google/google.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LocalCalendarsService, LocalEventInput } from '../local-calendars/local-calendars.service';
import { zonedTimeToUtc } from '../common/timezone';
import { DisplayEventsService } from '../display/display-events.service';
import { HolidaysService, HOLIDAYS_CALENDAR_ID, HOLIDAYS_CALENDAR_NAME, HOLIDAYS_CALENDAR_COLOR } from '../holidays/holidays.service';

export interface ShareSelection {
  googleCalendarId: string;
  name: string;
  color?: string;
}

// Appended to every family's calendar list unconditionally - the single
// global "Holidays" calendar (see HolidaysService), not something any family
// creates or owns. Its id doubles as the sentinel calendarIds entries use
// to opt into it (a DisplayConfig.calendarIds / Calendar-page filter array
// is a loose, unvalidated list of ids by design already, same as any other
// calendar id in there).
const HOLIDAYS_CALENDAR_ENTRY = {
  id: HOLIDAYS_CALENDAR_ID,
  name: HOLIDAYS_CALENDAR_NAME,
  color: HOLIDAYS_CALENDAR_COLOR,
  source: 'holiday' as const,
};

@Injectable()
export class CalendarsService {
  constructor(
    private prisma: PrismaService,
    private google: GoogleService,
    private notifications: NotificationsService,
    private localCalendars: LocalCalendarsService,
    private displayEvents: DisplayEventsService,
    private holidays: HolidaysService,
  ) {}

  // Google calendars available across the user's connected accounts (the
  // picker) - only ones this account actually owns (or has been granted
  // owner-level access to, which covers a deliberately shared household
  // calendar), not just anything merely shared to them read/write. Sharing
  // someone else's personal calendar into the family by accident isn't the
  // point; sharing your own, or a calendar you're a real co-owner of, is.
  //
  // One dead account (expired Google token) shouldn't blank the whole picker
  // for every other connected account - skip it and mark it for reconnect
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

  // Whether any of this user's connected Google accounts need reconnecting -
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
    const all = [...google, ...local, HOLIDAYS_CALENDAR_ENTRY];
    return this.applyColorOverrides(all, userId);
  }

  // Same shape as listShared(), but restricted to calendars relevant to the
  // caller's own location(s) - "relevant" meaning transitively, the same way
  // DisplaysService.calendarsForLocation already scopes Google calendars:
  // whoever SHARED it belongs to that location (or shares it family-wide,
  // no location of their own). A person with no location at all (unassigned,
  // or an owner who never set one) gets the unrestricted list - there's
  // nothing sensible to scope by. Local calendars use their own real
  // locationId directly, same rule as everywhere else in the app.
  async listSharedForLocation(familyId: string, userId: string) {
    const myLocs = new Set(
      (await this.prisma.userLocation.findMany({ where: { userId }, select: { locationId: true } })).map((r) => r.locationId),
    );
    if (myLocs.size === 0) return this.listShared(familyId, userId);

    const calendars = await this.prisma.calendar.findMany({
      where: { familyId },
      include: { shares: { include: { user: { include: { locations: true } } } } },
    });
    const visible = calendars.filter((c) =>
      c.shares.some((s) => {
        const sharerLocs = s.user.locations.map((l) => l.locationId);
        return sharerLocs.length === 0 || sharerLocs.some((id) => myLocs.has(id));
      }),
    );
    const google = visible.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      googleCalendarId: c.googleCalendarId,
      shareCount: c.shares.length,
      sharedByMe: c.shares.some((s) => s.userId === userId),
      source: 'google' as const,
    }));
    const localAll = await this.localCalendars.listForFamily(familyId);
    const local = localAll.filter((c) => !c.locationId || myLocs.has(c.locationId));
    const all = [...google, ...local, HOLIDAYS_CALENDAR_ENTRY];
    return this.applyColorOverrides(all, userId);
  }

  // Every calendar/event color below is whatever the calendar itself carries
  // (Google's own color, or whatever a local calendar's creator picked) -
  // fine as a shared default, but a viewer who wants a different color for
  // just their own view shouldn't need to change it for the whole family.
  // This is that personal override, applied last so it always wins.
  private async getColorOverrides(userId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.userCalendarColor.findMany({ where: { userId } });
    return new Map(rows.map((r) => [r.calendarId, r.color]));
  }

  private async applyColorOverrides<T extends { id: string; color?: string | null }>(
    items: T[],
    userId: string,
  ): Promise<T[]> {
    const overrides = await this.getColorOverrides(userId);
    if (overrides.size === 0) return items;
    return items.map((item) => (overrides.has(item.id) ? { ...item, color: overrides.get(item.id) } : item));
  }

  // Owner/family-manager only: change the calendar's own actual color (what
  // Google gave it, or what a local calendar's creator picked), not a
  // personal override - this is the shared default everyone sees unless they
  // set their own override on top of it. Holidays has no real row to update
  // (it's a synthetic entry, see HOLIDAYS_CALENDAR_ENTRY), so it's excluded.
  async setBaseColor(familyId: string, userId: string, calendarId: string, color: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: userId } });
    if (actor?.role !== 'OWNER' && actor?.role !== 'FAMILY_MANAGER') {
      throw new ForbiddenException('Owners and family managers only');
    }
    const google = await this.prisma.calendar.findFirst({ where: { id: calendarId, familyId } });
    if (google) {
      await this.prisma.calendar.update({ where: { id: calendarId }, data: { color } });
      return { ok: true };
    }
    const local = await this.prisma.localCalendar.findFirst({ where: { id: calendarId, familyId } });
    if (local) {
      await this.prisma.localCalendar.update({ where: { id: calendarId }, data: { color } });
      return { ok: true };
    }
    throw new NotFoundException('Calendar not found');
  }

  // Set (or, with color null, clear) the requesting user's personal color
  // override for one calendar. Scoped to familyId even though the override
  // itself isn't family-specific data - just so a stray/garbage calendarId
  // from outside your own family can't silently create an orphaned row.
  async setColor(familyId: string, userId: string, calendarId: string, color: string | null) {
    const exists =
      calendarId === HOLIDAYS_CALENDAR_ID ||
      (await this.prisma.calendar.findFirst({ where: { id: calendarId, familyId }, select: { id: true } })) ||
      (await this.prisma.localCalendar.findFirst({ where: { id: calendarId, familyId }, select: { id: true } }));
    if (!exists) throw new NotFoundException('Calendar not found');

    if (!color) {
      await this.prisma.userCalendarColor.deleteMany({ where: { userId, calendarId } });
      return { ok: true, color: null };
    }
    await this.prisma.userCalendarColor.upsert({
      where: { userId_calendarId: { userId, calendarId } },
      update: { color },
      create: { userId, calendarId, color },
    });
    return { ok: true, color };
  }

  // Aggregate events across selected shared calendars, deduped by iCalUID so the
  // same event on two shared calendars only appears once.
  // userId is optional: the kiosk/display feeds (display.service.ts,
  // displays.service.ts) call this for a shared, unpersonalized view with no
  // single "current user" to apply an override for - only the main app's own
  // per-session call (calendars.controller.ts) passes one.
  async events(familyId: string, calendarIds: string[], timeMin: string, timeMax: string, userId?: string) {
    const calendars = await this.prisma.calendar.findMany({
      where: { familyId, id: { in: calendarIds } },
      include: { googleAccount: { include: { user: true } } },
    });
    const googleIds = new Set(calendars.map((c) => c.id));
    const wantsHolidays = calendarIds.includes(HOLIDAYS_CALENDAR_ID);
    const localIds = calendarIds.filter((id) => !googleIds.has(id) && id !== HOLIDAYS_CALENDAR_ID);
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
        // This calendar's account needs reconnecting (already marked) - skip
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
    if (wantsHolidays) events.push(...(await this.holidays.occurrences(timeMin, timeMax)));

    // Resolve "added by" to a display name - a separate identity from the
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

    const overrides = userId ? await this.getColorOverrides(userId) : new Map<string, string>();
    if (overrides.size > 0) {
      for (const e of events as Array<{ calendarId?: string; calendarColor?: string }>) {
        if (e.calendarId && overrides.has(e.calendarId)) e.calendarColor = overrides.get(e.calendarId);
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
  // LocalCalendar - the frontend (AddEventModal, the kiosk) doesn't know or
  // care which, it just posts to `/calendars/:calendarId/events`.
  // A timed dateTime here is a naive "YYYY-MM-DDTHH:mm:ss" plus a separate
  // timeZone field (how AddEventModal builds it, mirroring Google's event
  // resource shape) - NOT an ISO instant. `new Date(...)` on a string with no
  // offset parses as the JS runtime's local time, which inside the Docker
  // container is UTC, not the browser's zone - so every timed local event
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
  // the app can show who added them - separate from the calendar's own Google
  // account owner.
  async createEvent(familyId: string, calendarId: string, addedByUserId: string, body: Record<string, unknown>) {
    await assertKidPermission(this.prisma, addedByUserId, 'calendarAdd');
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
    this.notifyCalendarEvent(familyId, c.id, c.name, addedByUserId, (body.summary as string) ?? 'an event', data.id ?? undefined).catch(
      () => undefined,
    );
    this.displayEvents.publish(familyId, { type: 'calendar' });
    return data;
  }

  // Adults always get notified (mirrors them generally seeing the whole family
  // calendar); a kid only gets notified if the calendar is actually on one of
  // their own location's kiosk displays - same rule that governs what they can
  // see in the app in the first place.
  private async notifyCalendarEvent(
    familyId: string,
    calendarId: string,
    calendarName: string,
    addedByUserId: string,
    summary: string,
    eventId?: string,
  ) {
    const adder = await this.prisma.user.findUnique({ where: { id: addedByUserId } });
    const title = `${adder?.displayName ?? 'Someone'} added "${summary}" to ${calendarName}`;
    await this.notifications.notifyAdults(familyId, 'CALENDAR_EVENT_ADDED', title, {
      link: '/',
      excludeUserId: addedByUserId,
      refId: eventId,
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
      kids.map((k) => this.notifications.create(familyId, k.id, 'CALENDAR_EVENT_ADDED', title, { link: '/', refId: eventId })),
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
    await this.assertCanEditGoogleEvent(c, eventId, actorId);
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
    await this.assertCanEditGoogleEvent(c, eventId, actorId);
    await this.google.withCalendar(c.googleAccountId, (cal) =>
      cal.events.delete({
        calendarId: c.googleCalendarId,
        eventId,
      }),
    );
    await this.notifications.removeByRef(eventId);
    this.displayEvents.publish(familyId, { type: 'calendar' });
    return { ok: true };
  }

  // Mirrors LocalCalendarsService.assertCanEdit - an adult always may, and
  // whoever originally added it may edit their own - for a Google-backed
  // event too. Without this, updateEvent/deleteEvent had NO permission check
  // at all on this branch (createEvent's own attribution-stamping was the
  // only place "who added it" was ever recorded), so any family member could
  // edit or delete literally any event on any shared Google calendar the
  // moment there was UI for it. addedBy is read back from the event's own
  // extendedProperties (the same field createEvent stamps it with), not
  // stored anywhere else.
  private async assertCanEditGoogleEvent(c: { googleAccountId: string; googleCalendarId: string; familyId: string }, eventId: string, actorId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (actor && actor.familyId === c.familyId && ['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(actor.role)) return;
    const { data } = await this.google.withCalendar(c.googleAccountId, (cal) =>
      cal.events.get({ calendarId: c.googleCalendarId, eventId }),
    );
    const addedBy = (data.extendedProperties?.private as Record<string, string> | undefined)?.roostHqAddedBy;
    if (addedBy !== actorId) throw new ForbiddenException('Only an adult, or whoever added it, can change this event');
  }
}
