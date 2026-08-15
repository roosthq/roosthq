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
import { LoginThrottleService } from '../security/login-throttle.service';
import { DEFAULT_TIMEZONE, weekRangeInZone } from '../common/timezone';

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
    private calendars: CalendarsService,
    private throttle: LoginThrottleService,
  ) {}

  // Events for the family's default display calendars. The kiosk doesn't need to know
  // which calendars - the server resolves them from settings. Accepts an optional
  // date range (for the month grid); defaults to this week.
  async displayEvents(familyId: string, start?: string, end?: string) {
    const settings = await this.get(familyId);
    const ids = (settings.defaultCalendarIds as string[]) ?? [];
    if (!ids.length) return [];
    // No location context available on this legacy family-default-calendars
    // path (unlike DisplaysService.events, which knows a specific display's
    // locationId) - the instance-wide default is the best available zone.
    const range = start && end ? { start, end } : weekRangeInZone(DEFAULT_TIMEZONE);
    return this.calendars.events(familyId, ids, range.start, range.end);
  }


  // Unlock a profile on the kiosk. Adults must have and provide a PIN; kids need a
  // PIN only if one is set. Returns a short-lived kiosk token to act as that user.
  async unlock(familyId: string, userId: string, pin?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    if (!user) throw new NotFoundException('Profile not found');
    const isAdult = user.role === 'OWNER' || user.role === 'FAMILY_MANAGER' || user.role === 'ADULT';

    // pinDisabled only ever excuses a KID from re-entering a PIN they keep
    // forgetting - an adult still must have and use one; that requirement is
    // the actual security boundary between "anyone at the kiosk" and "an
    // adult", so it can't be waived the same way.
    if (user.pinHash && !(user.pinDisabled && !isAdult)) {
      // A PIN is 4-6 digits - trivially guessable without a lockout. Keyed
      // per-profile, not per-display, so the same kid mashing buttons on two
      // different kiosks in the house still only gets one attempt budget.
      const key = `pin:${familyId}:${userId}`;
      this.throttle.assertNotLocked(key);
      if (!pin || !verifyPin(pin, user.pinHash)) {
        this.throttle.recordFailure(key);
        throw new UnauthorizedException('Wrong PIN');
      }
      this.throttle.recordSuccess(key);
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
        // #9 - so the kiosk can show the "away/vacation/at another house"
        // banner for whoever's selected without a second round-trip.
        presenceStatus: user.presenceStatus,
        presenceLocationId: user.presenceLocationId,
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
    if (!user || (user.role !== 'OWNER' && user.role !== 'FAMILY_MANAGER')) {
      throw new ForbiddenException('Only the owner or a family manager can change display settings');
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
    this.events.publish(familyId, { type: 'display' });
    return saved;
  }
}
