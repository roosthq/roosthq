import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CalendarsService } from '../calendars/calendars.service';
import { DisplayEventsService } from './display-events.service';

export interface DisplayConfigInput {
  name?: string;
  calendarIds?: string[];
  enabledFeatures?: string[];
  theme?: string;
}

export interface ResolvedConfig {
  id: string | null;
  name: string;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
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
  ) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'ADULT')) throw new ForbiddenException('Adults only');
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
    return this.prisma.displayConfig.create({
      data: {
        familyId,
        name: dto.name?.trim() || 'Display',
        calendarIds: dto.calendarIds ?? [],
        enabledFeatures: dto.enabledFeatures ?? ['calendar', 'chores'],
        theme: dto.theme ?? 'light',
        createdById: actorId,
      },
    });
  }

  async update(familyId: string, actorId: string, id: string, dto: DisplayConfigInput) {
    await this.assertAdult(actorId);
    await this.owned(familyId, id);
    const updated = await this.prisma.displayConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.calendarIds !== undefined && { calendarIds: dto.calendarIds }),
        ...(dto.enabledFeatures !== undefined && { enabledFeatures: dto.enabledFeatures }),
        ...(dto.theme !== undefined && { theme: dto.theme }),
      },
    });
    this.displayEvents.publish(familyId, { type: 'display-updated', id });
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
      if (c) return this.normalize(c);
    }
    const first = await this.prisma.displayConfig.findFirst({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    });
    if (first) return this.normalize(first);

    const legacy = await this.prisma.displaySettings.findUnique({ where: { familyId } });
    if (legacy) {
      return {
        id: null,
        name: 'Display',
        calendarIds: (legacy.defaultCalendarIds as string[]) ?? [],
        enabledFeatures: (legacy.enabledFeatures as string[]) ?? ['calendar'],
        theme: legacy.theme,
      };
    }
    return { id: null, name: 'Display', calendarIds: [], enabledFeatures: ['calendar'], theme: 'light' };
  }

  private normalize(c: {
    id: string;
    name: string;
    calendarIds: unknown;
    enabledFeatures: unknown;
    theme: string;
  }): ResolvedConfig {
    return {
      id: c.id,
      name: c.name,
      calendarIds: (c.calendarIds as string[]) ?? [],
      enabledFeatures: (c.enabledFeatures as string[]) ?? ['calendar'],
      theme: c.theme,
    };
  }

  // Events for a resolved display config.
  async events(familyId: string, config: ResolvedConfig, start?: string, end?: string) {
    if (!config.calendarIds.length) return [];
    const range = start && end ? { start, end } : weekRange();
    return this.calendars.events(familyId, config.calendarIds, range.start, range.end);
  }
}
