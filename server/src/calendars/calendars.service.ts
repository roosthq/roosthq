import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GoogleService } from '../google/google.service';

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
  ) {}

  // Google calendars available across the user's connected accounts (the picker).
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
      const client = await this.google.clientForAccount(acc.id);
      const { data } = await this.google.calendar(client).calendarList.list();
      for (const item of data.items ?? []) {
        out.push({
          googleAccountId: acc.id,
          googleCalendarId: item.id as string,
          name: item.summary ?? '(untitled)',
          color: item.backgroundColor ?? undefined,
          primary: item.primary ?? false,
        });
      }
    }
    return out;
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
    return calendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      googleCalendarId: c.googleCalendarId,
      shareCount: c.shares.length,
      sharedByMe: c.shares.some((s) => s.userId === userId),
    }));
  }

  // Aggregate events across selected shared calendars, deduped by iCalUID so the
  // same event on two shared calendars only appears once.
  async events(familyId: string, calendarIds: string[], timeMin: string, timeMax: string) {
    const calendars = await this.prisma.calendar.findMany({
      where: { familyId, id: { in: calendarIds } },
      include: { googleAccount: { include: { user: true } } },
    });
    const byUid = new Map<string, Record<string, unknown> & { addedByUserId?: string; addedByName?: string }>();
    for (const c of calendars) {
      const owner = c.googleAccount?.user;
      const client = await this.google.clientForAccount(c.googleAccountId);
      const { data } = await this.google.calendar(client).events.list({
        calendarId: c.googleCalendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });
      for (const ev of data.items ?? []) {
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

  // body is a Google Calendar event resource (summary, start, end, location, ...).
  // addedByUserId is stamped into extendedProperties so events created through
  // the app can show who added them — separate from the calendar's own Google
  // account owner.
  async createEvent(familyId: string, calendarId: string, addedByUserId: string, body: Record<string, unknown>) {
    const c = await this.calendarOrThrow(familyId, calendarId);
    const client = await this.google.clientForAccount(c.googleAccountId);
    const { data } = await this.google.calendar(client).events.insert({
      calendarId: c.googleCalendarId,
      requestBody: { ...body, extendedProperties: { private: { roostHqAddedBy: addedByUserId } } } as never,
    });
    return data;
  }

  async updateEvent(
    familyId: string,
    calendarId: string,
    eventId: string,
    body: Record<string, unknown>,
  ) {
    const c = await this.calendarOrThrow(familyId, calendarId);
    const client = await this.google.clientForAccount(c.googleAccountId);
    const { data } = await this.google.calendar(client).events.patch({
      calendarId: c.googleCalendarId,
      eventId,
      requestBody: body as never,
    });
    return data;
  }

  async deleteEvent(familyId: string, calendarId: string, eventId: string) {
    const c = await this.calendarOrThrow(familyId, calendarId);
    const client = await this.google.clientForAccount(c.googleAccountId);
    await this.google.calendar(client).events.delete({
      calendarId: c.googleCalendarId,
      eventId,
    });
    return { ok: true };
  }
}
