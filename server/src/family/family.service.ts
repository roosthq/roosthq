import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { sanitizeDisabledFeatures, sanitizeSoundAssignments, SoundAssignment } from '../common/features';
import { GAME_TYPES } from '../reward-games/reward-games.service';

// Tables that hold credentials, tokens or instance-wide data: never exported.
const EXPORT_SKIP_MODELS = new Set([
  'GoogleAccount',
  'DisplayToken',
  'FamilyInvite',
  'PasswordResetToken',
  'PushSubscription',
  'InstanceSettings',
  'EduQuestion',
  'EduQuestionMedia',
]);
// Any column that looks like a secret is dropped from every table.
const SECRET_COLUMN = /hash|encrypted|secret|password|token$|^auth$|^p256dh$|^endpoint$/i;

type DmmfField = { name: string; kind: string; type: string; isList: boolean; relationFromFields?: readonly string[] };
type DmmfModel = { name: string; fields: readonly DmmfField[] };

@Injectable()
export class FamilyService {
  constructor(private prisma: PrismaService) {}

  // Powers the first-run checklist: plain counts, no content.
  async setupStatus(familyId: string) {
    const [members, kids, chores, prizes, localCalendars, googleCalendars, displays] = await Promise.all([
      this.prisma.user.count({ where: { familyId } }),
      this.prisma.user.count({ where: { familyId, role: 'KID' } }),
      this.prisma.chore.count({ where: { familyId } }),
      this.prisma.prize.count({ where: { familyId } }),
      this.prisma.localCalendar.count({ where: { familyId } }),
      this.prisma.calendar.count({ where: { familyId } }),
      this.prisma.displayToken.count({ where: { familyId, revokedAt: null } }),
    ]);
    return { members, kids, chores, prizes, calendars: localCalendars + googleCalendars, displays };
  }

  // A full copy of the family's own data as JSON - the family can always leave
  // with everything they entered. Built from the schema itself, so a table added
  // later is included automatically: a model is exported when it carries the
  // family (directly, via its user, or through a chain of parent rows). Anything
  // that looks like a credential is stripped, and instance-wide tables are skipped.
  async exportData(actorId: string, familyId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !['OWNER', 'FAMILY_MANAGER'].includes(actor.role)) {
      throw new ForbiddenException('Owner or family manager only');
    }
    const models = Prisma.dmmf.datamodel.models as unknown as DmmfModel[];
    const byName = new Map(models.map((m) => [m.name, m]));
    const memberIds = (await this.prisma.user.findMany({ where: { familyId }, select: { id: true } })).map((u) => u.id);

    // Builds the Prisma `where` that scopes a model to this family, following
    // many-to-one relations up to 3 parents deep. null = model is not family data.
    const scopeFor = (model: DmmfModel, depth = 0): Record<string, unknown> | null => {
      const scalar = (n: string) => model.fields.some((f) => f.name === n && f.kind === 'scalar');
      if (model.name === 'Family') return { id: familyId };
      if (scalar('familyId')) return { familyId };
      if (scalar('userId')) return { userId: { in: memberIds } };
      if (depth >= 3) return null;
      for (const f of model.fields) {
        if (f.kind !== 'object' || f.isList || !f.relationFromFields?.length) continue;
        const parent = byName.get(f.type);
        if (!parent || parent.name === model.name) continue;
        const inner = scopeFor(parent, depth + 1);
        if (inner) return { [f.name]: inner };
      }
      return null;
    };

    const tables: Record<string, unknown[]> = {};
    for (const model of models) {
      if (EXPORT_SKIP_MODELS.has(model.name)) continue;
      const where = scopeFor(model);
      if (!where) continue;
      const delegate = (this.prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[
        model.name.charAt(0).toLowerCase() + model.name.slice(1)
      ];
      if (!delegate?.findMany) continue;
      const rows = await delegate.findMany({ where });
      tables[model.name] = rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) if (!SECRET_COLUMN.test(k)) clean[k] = v;
        return clean;
      });
    }
    return { app: 'Roost HQ', formatVersion: 1, exportedAt: new Date().toISOString(), familyId, tables };
  }

  private shape(f: {
    id: string;
    name: string;
    tokenName: string;
    tokenIcon: string;
    tokenValueUsd: number;
    choreWord: string;
    disabledFeatures: unknown;
    soundAssignments: unknown;
    surpriseRewardDays: number;
    streakWheelMin: number;
    streakWheelMax: number;
    streakWheelGameType: string | null;
  }) {
    return {
      id: f.id,
      name: f.name,
      tokenName: f.tokenName,
      tokenIcon: f.tokenIcon,
      tokenValueUsd: f.tokenValueUsd,
      choreWord: f.choreWord,
      disabledFeatures: Array.isArray(f.disabledFeatures) ? (f.disabledFeatures as string[]) : [],
      soundAssignments:
        f.soundAssignments && typeof f.soundAssignments === 'object' && !Array.isArray(f.soundAssignments)
          ? (f.soundAssignments as Record<string, SoundAssignment>)
          : {},
      surpriseRewardDays: f.surpriseRewardDays,
      streakWheelMin: f.streakWheelMin,
      streakWheelMax: f.streakWheelMax,
      streakWheelGameType: f.streakWheelGameType,
    };
  }

  async settings(familyId: string) {
    const f = await this.prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    return this.shape(f);
  }

  async update(
    actorId: string,
    familyId: string,
    data: {
      name?: string;
      tokenName?: string;
      tokenIcon?: string;
      choreWord?: string;
      disabledFeatures?: string[];
      soundAssignments?: Record<string, SoundAssignment>;
      surpriseRewardDays?: number;
      streakWheelMin?: number;
      streakWheelMax?: number;
      // 'RANDOM' (or omitted with no prior value) means "surprise me" -
      // stored as null, same convention as Award.poolGameType. Sent as a
      // string, not undefined, so the field can be explicitly cleared back
      // to random after having been pinned.
      streakWheelGameType?: string | null;
    },
  ) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'FAMILY_MANAGER')) {
      throw new ForbiddenException('Owner or family manager only');
    }
    let sanitizedSounds: Record<string, SoundAssignment> | undefined;
    if (data.soundAssignments !== undefined) {
      const owned = await this.prisma.customSound.findMany({ where: { familyId }, select: { id: true } });
      sanitizedSounds = sanitizeSoundAssignments(data.soundAssignments, owned.map((c) => c.id));
    }
    // Chore-streak bonus wheel's reward range - direct edit is fine here
    // (unlike tokenValueUsd above): changing it doesn't need to cascade
    // anywhere else, it's just this one range. Clamped to a sane min<=max
    // pair using whichever side wasn't touched by this request as the other
    // bound, so sending just one of the two can't leave them crossed.
    let streakWheelMin: number | undefined;
    let streakWheelMax: number | undefined;
    if (data.streakWheelMin !== undefined || data.streakWheelMax !== undefined) {
      const existing = await this.prisma.family.findUniqueOrThrow({
        where: { id: familyId },
        select: { streakWheelMin: true, streakWheelMax: true },
      });
      const min = Math.max(0, Math.floor(data.streakWheelMin ?? existing.streakWheelMin));
      const max = Math.max(min, Math.floor(data.streakWheelMax ?? existing.streakWheelMax));
      streakWheelMin = min;
      streakWheelMax = max;
    }
    const f = await this.prisma.family.update({
      where: { id: familyId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.tokenName !== undefined && { tokenName: data.tokenName || 'Tokens' }),
        ...(data.tokenIcon !== undefined && { tokenIcon: data.tokenIcon || '🪙' }),
        // tokenValueUsd is deliberately NOT settable here - it only ever
        // changes through TokenScaleService's rescale flow (PLANNING.md
        // §17), which also rescales every token-denominated number in the
        // family to match. A plain patch here would silently desync prices
        // and balances from the new ratio.
        ...(data.choreWord !== undefined && { choreWord: data.choreWord.trim() || 'Chore' }),
        ...(data.disabledFeatures !== undefined && {
          disabledFeatures: sanitizeDisabledFeatures(data.disabledFeatures),
        }),
        ...(sanitizedSounds !== undefined && { soundAssignments: sanitizedSounds as unknown as Prisma.InputJsonValue }),
        ...(data.surpriseRewardDays !== undefined && { surpriseRewardDays: Math.max(1, Math.floor(data.surpriseRewardDays)) }),
        ...(streakWheelMin !== undefined && { streakWheelMin }),
        ...(streakWheelMax !== undefined && { streakWheelMax }),
        ...(data.streakWheelGameType !== undefined && {
          streakWheelGameType: data.streakWheelGameType && (GAME_TYPES as readonly string[]).includes(data.streakWheelGameType)
            ? data.streakWheelGameType
            : null,
        }),
      },
    });
    return this.shape(f);
  }
}
