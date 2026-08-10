import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { sanitizeDisabledFeatures } from '../common/features';

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
  }) {
    return {
      id: f.id,
      name: f.name,
      tokenName: f.tokenName,
      tokenIcon: f.tokenIcon,
      tokenValueUsd: f.tokenValueUsd,
      choreWord: f.choreWord,
      disabledFeatures: Array.isArray(f.disabledFeatures) ? (f.disabledFeatures as string[]) : [],
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
      tokenValueUsd?: number;
      choreWord?: string;
      disabledFeatures?: string[];
    },
  ) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'FAMILY_MANAGER')) {
      throw new ForbiddenException('Owner or family manager only');
    }
    const f = await this.prisma.family.update({
      where: { id: familyId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.tokenName !== undefined && { tokenName: data.tokenName || 'Tokens' }),
        ...(data.tokenIcon !== undefined && { tokenIcon: data.tokenIcon || '🪙' }),
        ...(data.tokenValueUsd !== undefined && { tokenValueUsd: data.tokenValueUsd > 0 ? data.tokenValueUsd : 1 }),
        ...(data.choreWord !== undefined && { choreWord: data.choreWord.trim() || 'Chore' }),
        ...(data.disabledFeatures !== undefined && {
          disabledFeatures: sanitizeDisabledFeatures(data.disabledFeatures),
        }),
      },
    });
    return this.shape(f);
  }
}
