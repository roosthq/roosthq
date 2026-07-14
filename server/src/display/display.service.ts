import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from './display-events.service';

const DEFAULT_FEATURES = ['calendar', 'chores', 'tokens', 'prizes'];

export interface DisplaySettingsInput {
  defaultCalendarIds?: string[];
  enabledFeatures?: string[];
  theme?: string;
}

@Injectable()
export class DisplayService {
  constructor(
    private prisma: PrismaService,
    private events: DisplayEventsService,
  ) {}

  async get(familyId: string) {
    const existing = await this.prisma.displaySettings.findUnique({ where: { familyId } });
    if (existing) return existing;
    return this.prisma.displaySettings.create({
      data: {
        familyId,
        defaultCalendarIds: [],
        enabledFeatures: DEFAULT_FEATURES,
        theme: 'light',
      },
    });
  }

  private async assertOwner(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'OWNER') {
      throw new ForbiddenException('Only the family owner can change display settings');
    }
  }

  async update(familyId: string, userId: string, data: DisplaySettingsInput) {
    await this.assertOwner(userId);
    const saved = await this.prisma.displaySettings.upsert({
      where: { familyId },
      update: {
        ...(data.defaultCalendarIds !== undefined && { defaultCalendarIds: data.defaultCalendarIds }),
        ...(data.enabledFeatures !== undefined && { enabledFeatures: data.enabledFeatures }),
        ...(data.theme !== undefined && { theme: data.theme }),
      },
      create: {
        familyId,
        defaultCalendarIds: data.defaultCalendarIds ?? [],
        enabledFeatures: data.enabledFeatures ?? DEFAULT_FEATURES,
        theme: data.theme ?? 'light',
      },
    });
    // Push the change to any live display devices in real time.
    this.events.publish(familyId, saved);
    return saved;
  }
}
