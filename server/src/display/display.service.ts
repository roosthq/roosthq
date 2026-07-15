import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from './display-events.service';
import { CalendarsService } from '../calendars/calendars.service';
import { verifyPin } from '../crypto/pin';
import { signKiosk } from '../auth/jwt';

const DEFAULT_FEATURES = ['calendar', 'chores', 'tokens', 'prizes'];

export interface DisplaySettingsInput {
  defaultCalendarIds?: string[];
  enabledFeatures?: string[];
  theme?: string;
}

function weekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}

@Injectable()
export class DisplayService {
  constructor(
    private prisma: PrismaService,
    private events: DisplayEventsService,
    private calendars: CalendarsService,
  ) {}

  // Events for the family's default display calendars. The kiosk doesn't need to know
  // which calendars — the server resolves them from settings. Accepts an optional
  // date range (for the month grid); defaults to this week.
  async displayEvents(familyId: string, start?: string, end?: string) {
    const settings = await this.get(familyId);
    const ids = (settings.defaultCalendarIds as string[]) ?? [];
    if (!ids.length) return [];
    const range = start && end ? { start, end } : weekRange();
    return this.calendars.events(familyId, ids, range.start, range.end);
  }


  // Unlock a profile on the kiosk. Adults must have and provide a PIN; kids need a
  // PIN only if one is set. Returns a short-lived kiosk token to act as that user.
  async unlock(familyId: string, userId: string, pin?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!user) throw new NotFoundException('Profile not found');
    const isAdult = user.role === 'OWNER' || user.role === 'ADULT';

    if (user.pinHash) {
      if (!pin || !verifyPin(pin, user.pinHash)) throw new UnauthorizedException('Wrong PIN');
    } else if (isAdult) {
      throw new ForbiddenException('This adult needs a PIN set (in the app) before using the kiosk');
    }

    return {
      token: signKiosk({ userId: user.id, familyId }),
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        avatar: user.avatar,
        colorTheme: user.colorTheme,
      },
    };
  }

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
