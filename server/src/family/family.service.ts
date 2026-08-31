import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { sanitizeDisabledFeatures, sanitizeSoundAssignments, SoundAssignment } from '../common/features';
import { GAME_TYPES } from '../reward-games/reward-games.service';

@Injectable()
export class FamilyService {
  constructor(private prisma: PrismaService) {}

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
