import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HOLIDAY_SEED } from './holiday-seed';
import { projectOccurrences, nextOccurrence } from './holiday-rules';

export const HOLIDAYS_CALENDAR_ID = 'holidays';
export const HOLIDAYS_CALENDAR_NAME = 'Holidays';
export const HOLIDAYS_CALENDAR_COLOR = '#c2410c';

const RULE_TYPES = new Set(['FIXED', 'NTH_WEEKDAY', 'EASTER_OFFSET']);

export interface HolidayRuleInput {
  title: string;
  ruleType: 'FIXED' | 'NTH_WEEKDAY' | 'EASTER_OFFSET';
  month?: number | null;
  day?: number | null;
  weekday?: number | null;
  ordinal?: number | null;
  offsetDays?: number | null;
}

// The single global "Holidays" calendar every family can add to their own
// picker (CalendarsService merges its projected occurrences in wherever
// HOLIDAYS_CALENDAR_ID appears in a requested calendarIds list) - deliberately
// not family-scoped (see HolidayEvent in schema.prisma) and editable only by
// the instance owner, the same literal Role.OWNER gate OwnerService uses for
// multi-family admin.
@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}

  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
  }

  private validate(dto: HolidayRuleInput) {
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    if (!RULE_TYPES.has(dto.ruleType)) throw new BadRequestException('Invalid rule type');
    if (dto.ruleType === 'FIXED' && (!dto.month || !dto.day)) {
      throw new BadRequestException('Month and day are required for a fixed-date holiday');
    }
    if (dto.ruleType === 'NTH_WEEKDAY' && (!dto.month || dto.weekday == null || !dto.ordinal)) {
      throw new BadRequestException('Month, weekday, and ordinal are required for a nth-weekday holiday');
    }
  }

  // Seeds the default US-federal-plus-cultural set the first time this is
  // called against an empty table - not a migration, so the owner freely
  // editing/deleting afterward never gets silently re-seeded.
  async ensureSeeded() {
    const count = await this.prisma.holidayEvent.count();
    if (count > 0) return;
    await this.prisma.holidayEvent.createMany({ data: HOLIDAY_SEED });
  }

  // Owner-only: the raw rule table, for the Settings admin editor. Everyone
  // else only ever sees the rendered occurrences via occurrences() below.
  // Ordered by upcoming date (not raw month/day - that column is null for
  // NTH_WEEKDAY/EASTER_OFFSET rows and wouldn't reflect ordinal/Easter shifts
  // anyway), each annotated with its computed next occurrence so the UI can
  // show a month tag and "next: <date>" without recomputing.
  async list(actorId: string) {
    await this.assertOwner(actorId);
    await this.ensureSeeded();
    const rules = await this.prisma.holidayEvent.findMany();
    const now = new Date();
    const annotated = rules.map((r) => {
      const next = nextOccurrence(r, now);
      return { ...r, nextOccurrence: next ? next.toISOString().slice(0, 10) : null };
    });
    annotated.sort((a, b) => {
      // Malformed rows (no computable next date) sink to the bottom rather
      // than sorting first, since a null date otherwise reads as "earliest".
      if (!a.nextOccurrence) return 1;
      if (!b.nextOccurrence) return -1;
      return a.nextOccurrence.localeCompare(b.nextOccurrence);
    });
    return annotated;
  }

  async create(actorId: string, dto: HolidayRuleInput) {
    await this.assertOwner(actorId);
    this.validate(dto);
    return this.prisma.holidayEvent.create({
      data: {
        title: dto.title.trim(),
        ruleType: dto.ruleType,
        month: dto.month ?? null,
        day: dto.day ?? null,
        weekday: dto.weekday ?? null,
        ordinal: dto.ordinal ?? null,
        offsetDays: dto.offsetDays ?? null,
      },
    });
  }

  async update(actorId: string, id: string, dto: Partial<HolidayRuleInput>) {
    await this.assertOwner(actorId);
    const existing = await this.prisma.holidayEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Holiday not found');
    const merged: HolidayRuleInput = {
      title: dto.title ?? existing.title,
      ruleType: (dto.ruleType ?? existing.ruleType) as HolidayRuleInput['ruleType'],
      month: dto.month !== undefined ? dto.month : existing.month,
      day: dto.day !== undefined ? dto.day : existing.day,
      weekday: dto.weekday !== undefined ? dto.weekday : existing.weekday,
      ordinal: dto.ordinal !== undefined ? dto.ordinal : existing.ordinal,
      offsetDays: dto.offsetDays !== undefined ? dto.offsetDays : existing.offsetDays,
    };
    this.validate(merged);
    return this.prisma.holidayEvent.update({
      where: { id },
      data: {
        title: merged.title.trim(),
        ruleType: merged.ruleType,
        month: merged.month ?? null,
        day: merged.day ?? null,
        weekday: merged.weekday ?? null,
        ordinal: merged.ordinal ?? null,
        offsetDays: merged.offsetDays ?? null,
      },
    });
  }

  async remove(actorId: string, id: string) {
    await this.assertOwner(actorId);
    const existing = await this.prisma.holidayEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Holiday not found');
    await this.prisma.holidayEvent.delete({ where: { id } });
    return { ok: true };
  }

  // Flat CalEvent-shaped occurrences for [timeMin, timeMax) - what
  // CalendarsService.events() merges in whenever HOLIDAYS_CALENDAR_ID is
  // among the requested calendarIds. All-day by construction (a holiday
  // doesn't have a time of day), tagged with the shared sentinel color/name
  // so the calendar grid renders it consistently across every family.
  async occurrences(timeMin: string, timeMax: string) {
    await this.ensureSeeded();
    const rules = await this.prisma.holidayEvent.findMany();
    return projectOccurrences(rules, new Date(timeMin), new Date(timeMax)).map((e) => ({
      ...e,
      calendarColor: HOLIDAYS_CALENDAR_COLOR,
      calendarName: HOLIDAYS_CALENDAR_NAME,
    }));
  }
}
