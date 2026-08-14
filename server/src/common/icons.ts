// Server-side mirror of web/src/icons/catalog.ts + web/src/icons/slots.ts.
// The catalog is ~1900 entries (curated Lucide names + the full non-skin-
// toned Unicode emoji set) - too big to usefully duplicate as a literal
// array here, and it doesn't need to be: every valid key has one of exactly
// two shapes (a kebab-case Lucide name, or 'emoji_<hex>[_<hex>...]'), so a
// regex captures the real constraint. Worst case for a garbage value here is
// a 404'd image, not a security issue - this only ever feeds a static asset
// path, never a query or a file-system path directly.
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export const ICON_SETS = ['LUCIDE', 'NOTO', 'TWEMOJI', 'FLUENT_3D'] as const;
export type IconSetName = (typeof ICON_SETS)[number];

export const DEFAULT_ICON_SET: IconSetName = 'NOTO';

const LUCIDE_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const EMOJI_KEY_RE = /^emoji_[0-9a-f]+(_[0-9a-f]+)*$/;

export function isValidIconKey(key: unknown): key is string {
  return typeof key === 'string' && key.length < 80 && (LUCIDE_KEY_RE.test(key) || EMOJI_KEY_RE.test(key));
}

export function isValidIconSet(set: unknown): set is IconSetName {
  return typeof set === 'string' && (ICON_SETS as readonly string[]).includes(set);
}

// Named UI positions - see web/src/icons/slots.ts (kept in sync by hand,
// same convention as FEATURE_TREE/SOUND_SLOTS - this list is short enough
// that literal duplication is the simplest correct option).
export const ICON_SLOT_IDS: string[] = [
  'nav.calendar',
  'nav.chores',
  'nav.store',
  'nav.profiles',
  'role.owner',
  'role.familyManager',
  'role.adult',
  'role.kid',
  'badge.level',
  'badge.streak',
  'chores.today',
  'chores.bonusWheel',
  'chores.packs',
  'kiosk.giveAward',
  'kiosk.calendarView',
  'kiosk.tonight',
  'kiosk.groceryCount',
  'kiosk.rules',
  'kiosk.stats',
  'household.grocery',
  'household.countdowns',
  'household.announcements',
  'household.dinnerMeal',
  'household.dinnerRandom',
  'search.chores',
  'search.events',
  'search.notifications',
  'search.rules',
  'search.prizes',
  'search.awards',
  'prize.item',
  'prize.event',
  'store.awardOnly',
  'store.purchasable',
  'notif.CHORE_PENDING',
  'notif.CHORE_APPROVED',
  'notif.CHORE_REJECTED',
  'notif.CHORE_MISSED',
  'notif.CHORE_DUE_SOON',
  'notif.STREAK_BONUS',
  'notif.REDEMPTION_REQUESTED',
  'notif.REDEMPTION_FULFILLED',
  'notif.REDEMPTION_REJECTED',
  'notif.PRIZE_SUGGESTED',
  'notif.CALENDAR_EVENT_ADDED',
  'notif.CALENDAR_EVENT_REMINDER',
  'notif.AWARD_GRANTED',
  'notif.GAME_PRIZE_WON',
  'game.WHEEL',
  'game.MYSTERY_BOX',
  'game.SCRATCH_CARD',
  'game.SLOT_MACHINE',
  'game.DICE_ROLL',
  'game.COIN_FLIP',
  'game.GIFT_BOX',
  'game.PLINKO',
];

export function isValidSlotId(id: unknown): id is string {
  return typeof id === 'string' && ICON_SLOT_IDS.includes(id);
}

export async function assertOwnerOrFM(prisma: PrismaService, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || (u.role !== 'OWNER' && u.role !== 'FAMILY_MANAGER')) {
    throw new ForbiddenException('Owner or family manager only');
  }
}

export async function assertInstanceOwner(prisma: PrismaService, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
}
