// Server-side mirror of the icon catalog in web/src/icons/catalog.ts - same
// hand-kept-in-sync pattern as FEATURE_TREE (features.ts) and SOUND_SLOTS/
// BUILTIN_SOUND_IDS (also this file's neighbors). This file only needs the
// flat key/set lists to validate whatever gets written to AppIconSetting/
// FamilyIconSetting - the actual asset paths and category grouping are a
// client-rendering concern and live only in the web catalog.
//
// AUTO-GENERATED from catalog.ts's key list (196 entries: the curated
// lucideData.ts picker library plus 2 reward-game-type-only concepts with
// no real Lucide equivalent) - regenerate together if catalog.ts changes.
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export const ICON_SETS = ['NOTO', 'TWEMOJI', 'FLUENT_3D'] as const;
export type IconSetName = (typeof ICON_SETS)[number];

export const DEFAULT_ICON_SET: IconSetName = 'NOTO';

export const ICON_KEYS: string[] = [
  'trophy', 'medal', 'award', 'ribbon', 'crown', 'star', 'sparkle', 'sparkles',
  'flame', 'zap', 'dumbbell', 'thumbs-up', 'hand', 'handshake', 'heart', 'heart-handshake',
  'party-popper', 'gift', 'rocket', 'rainbow', 'target', 'percent', 'check', 'check-check',
  'check-circle', 'check-square', 'badge-check', 'diamond', 'smile', 'smile-plus', 'laugh', 'angry',
  'frown', 'meh', 'baby', 'user', 'user-round', 'users', 'graduation-cap', 'ghost',
  'skull', 'dog', 'cat', 'rabbit', 'bird', 'feather', 'fish', 'bug',
  'turtle', 'snail', 'squirrel', 'paw-print', 'trees', 'flower', 'flower-2', 'sprout',
  'leaf', 'sun', 'sunrise', 'sunset', 'cloud', 'cloud-sun', 'cloud-rain', 'cloud-lightning',
  'snowflake', 'tornado', 'moon', 'mountain', 'mountain-snow', 'waves', 'apple', 'banana',
  'cherry', 'grape', 'carrot', 'pizza', 'sandwich', 'beef', 'drumstick', 'salad',
  'egg', 'croissant', 'cake', 'cookie', 'donut', 'ice-cream-cone', 'candy', 'popcorn',
  'coffee', 'cup-soda', 'milk', 'utensils', 'utensils-crossed', 'volleyball', 'circle-dot', 'bike',
  'footprints', 'gamepad', 'gamepad-2', 'joystick', 'dice-5', 'puzzle', 'palette', 'paintbrush',
  'pencil', 'book-open', 'book', 'music', 'music-2', 'guitar', 'piano', 'mic',
  'mic-2', 'clapperboard', 'drama', 'camera', 'telescope', 'microscope', 'flask-conical', 'car',
  'bus', 'train', 'plane', 'ship', 'map', 'map-pin', 'map-pinned', 'compass',
  'luggage', 'tent', 'umbrella', 'globe', 'home', 'house', 'school', 'hospital',
  'church', 'building', 'building-2', 'landmark', 'warehouse', 'factory', 'broom', 'spray-can',
  'droplet', 'washing-machine', 'shirt', 'trash-2', 'bed', 'sofa', 'shower-head', 'toilet',
  'brush', 'shopping-cart', 'shopping-basket', 'shopping-bag', 'receipt', 'notebook-pen', 'clipboard-list', 'calendar',
  'calendar-days', 'alarm-clock', 'hourglass', 'bell', 'lock', 'key', 'lightbulb', 'wrench',
  'hammer', 'toolbox', 'package', 'package-2', 'ruler', 'calculator', 'tv', 'watch',
  'smartphone', 'laptop', 'headphones', 'coins', 'banknote', 'wallet', 'gem', 'ticket',
  'tickets', 'ferris-wheel', 'alert-triangle', 'help-circle', 'octagon-alert', 'ban', 'recycle', 'circle',
  'activity', 'fan', 'slot-machine', 'plinko-ball',
];

export function isValidIconKey(key: unknown): key is string {
  return typeof key === 'string' && ICON_KEYS.includes(key);
}

export function isValidIconSet(set: unknown): set is IconSetName {
  return typeof set === 'string' && (ICON_SETS as readonly string[]).includes(set);
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
