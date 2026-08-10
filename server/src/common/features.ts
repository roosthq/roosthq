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
    children: [{ id: 'levels' }, { id: 'leaderboard' }, { id: 'allowance' }, { id: 'digest' }],
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
  return TOP_LEVEL_IDS.filter(envDisabled);
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
