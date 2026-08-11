import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Server-side mirror of FEATURE_TREE in web/src/api.ts - keep both in sync by
// hand (same pattern as kid-permissions.ts mirroring KID_PERMISSIONS). This is
// the source of truth for: which ids are real (sanitizing whatever gets
// written to Family.disabledFeatures), what a fresh family's disabled list
// starts as (env-driven, top-level ids only), and whether a given feature is
// actually usable right now (its own switch plus every ancestor's).
export interface FeatureNode {
  id: string;
  children?: FeatureNode[];
  requires?: string;
}

export const FEATURE_TREE: FeatureNode[] = [
  {
    id: 'tokens',
    children: [{ id: 'levels' }, { id: 'leaderboard' }, { id: 'allowance' }, { id: 'digest' }, { id: 'surpriseReward' }],
  },
  {
    id: 'chores',
    children: [{ id: 'photoProof' }, { id: 'streakFreeze' }, { id: 'bonusWheel', requires: 'tokens' }],
  },
  { id: 'store', requires: 'tokens' },
  { id: 'awards' },
  {
    id: 'household',
    children: [{ id: 'meals' }, { id: 'grocery' }, { id: 'countdowns' }, { id: 'announcements' }, { id: 'rules' }],
  },
];

export const ALL_FEATURE_IDS: string[] = FEATURE_TREE.flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)]);

const TOP_LEVEL_IDS: string[] = FEATURE_TREE.map((n) => n.id);

function featureAncestors(id: string): string[] {
  for (const node of FEATURE_TREE) {
    if (node.id === id) return node.requires ? [node.requires] : [];
    const child = node.children?.find((c) => c.id === id);
    if (child) return child.requires ? [node.id, child.requires] : [node.id];
  }
  return [];
}

// Whatever a client sends for disabledFeatures, keep only real, unique ids -
// a stray/typo'd string (or an id from a since-removed feature) shouldn't
// silently pile up in this list forever.
export function sanitizeDisabledFeatures(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((x): x is string => typeof x === 'string' && ALL_FEATURE_IDS.includes(x)))];
}

// A fresh family's starting disabledFeatures list, driven by DEFAULT_FEATURE_*
// env vars (top-level modules only - "false"/"0"/"off" disables it out of the
// box; anything else, including unset, leaves it on). Sub-features under an
// enabled module always start on; turn them off per-family afterward.
function envDisabled(id: string): boolean {
  const raw = process.env[`DEFAULT_FEATURE_${id.toUpperCase()}`];
  return raw === 'false' || raw === '0' || raw === 'off';
}

export function defaultDisabledFeatures(): string[] {
  // Every OTHER sub-feature defaults on the instant its parent module is on
  // (see the comment above envDisabled) - surpriseReward is the deliberate
  // exception (#8's resolved plan): a random-token-grant feature opting
  // itself in for a self-hoster who never asked for it would be a bad
  // surprise in the wrong direction. Off until a family turns it on.
  return [...TOP_LEVEL_IDS.filter(envDisabled), 'surpriseReward'];
}

// Server-side mirror of SOUND_SLOTS/BUILTIN_SOUNDS in web/src/sounds.ts - same
// hand-kept-in-sync pattern as FEATURE_TREE above. Used only to validate
// whatever gets written to Family.soundAssignments; the actual sound
// playback is entirely client-side.
export const SOUND_SLOTS: string[] = [
  'choreCompleted',
  'choreApproved',
  'streakMilestone',
  'redemptionFulfilled',
  'rewardGameWin',
  'levelUp',
  'notification',
];

export const BUILTIN_SOUND_IDS: string[] = [
  'chime',
  'pop',
  'coin',
  'successBell',
  'sparkle',
  'xylophone',
  'whooshUp',
  'bloop',
  'fanfare',
  'gentleDing',
];

export interface SoundAssignment {
  type: 'builtin' | 'custom';
  id: string;
}

// Drops any slot that isn't real, any assignment missing a valid
// type/id, and any 'custom' assignment pointing at a sound this family
// doesn't actually own (a deleted upload, or a stray id) - same
// never-let-garbage-pile-up spirit as sanitizeDisabledFeatures.
export function sanitizeSoundAssignments(input: unknown, ownedCustomIds: string[]): Record<string, SoundAssignment> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, SoundAssignment> = {};
  for (const [slot, val] of Object.entries(input as Record<string, unknown>)) {
    if (!SOUND_SLOTS.includes(slot) || !val || typeof val !== 'object') continue;
    const { type, id } = val as { type?: unknown; id?: unknown };
    if (typeof id !== 'string') continue;
    if (type === 'builtin' && BUILTIN_SOUND_IDS.includes(id)) out[slot] = { type, id };
    else if (type === 'custom' && ownedCustomIds.includes(id)) out[slot] = { type, id };
  }
  return out;
}

export function featureEnabled(disabledFeatures: unknown, feature: string): boolean {
  const disabled = sanitizeDisabledFeatures(disabledFeatures);
  if (disabled.includes(feature)) return false;
  return featureAncestors(feature).every((a) => !disabled.includes(a));
}

// DB-backed versions for services that only have a familyId, not an
// already-loaded Family row. `assertFeatureEnabled` is the one to call at the
// top of any read or write that only makes sense with `feature` on - it
// throws the same way assertKidPermission does, so a toggled-off feature
// behaves like it doesn't exist for anyone who reaches it directly (bypassed
// nav, a stale kiosk tab, a replayed request), not just hidden in the UI.
export async function isFeatureEnabled(prisma: PrismaService, familyId: string, feature: string): Promise<boolean> {
  const f = await prisma.family.findUnique({ where: { id: familyId }, select: { disabledFeatures: true } });
  return featureEnabled(f?.disabledFeatures, feature);
}

export async function assertFeatureEnabled(prisma: PrismaService, familyId: string, feature: string): Promise<void> {
  if (!(await isFeatureEnabled(prisma, familyId, feature))) {
    throw new ForbiddenException(`This family has turned "${feature}" off`);
  }
}
