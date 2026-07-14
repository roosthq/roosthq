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
    });
    const byUid = new Map<string, unknown>();
    for (const c of calendars) {
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
          byUid.set(uid, {
            id: ev.id,
            uid,
            calendarId: c.id,
            calendarColor: c.color,
            title: ev.summary,
            start: ev.start,
            end: ev.end,
            location: ev.location,
          });
        }
      }
    }
    return Array.from(byUid.values());
  }

  private async calendarOrThrow(familyId: string, calendarId: string) {
    const cal = await this.prisma.calendar.findFirst({ where: { id: calendarId, familyId } });
    if (!cal) throw new NotFoundException('Calendar not found');
    return cal;
  }

  // body is a Google Calendar event resource (summary, start, end, location, ...).
  async createEvent(familyId: string, calendarId: string, body: Record<string, unknown>) {
    const c = await this.calendarOrThrow(familyId, calendarId);
    const client = await this.google.clientForAccount(c.googleAccountId);
    const { data } = await this.google.calendar(client).events.insert({
      calendarId: c.googleCalendarId,
      requestBody: body as never,
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
