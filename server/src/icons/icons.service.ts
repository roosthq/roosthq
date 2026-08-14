import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ICON_KEYS, DEFAULT_ICON_SET, isValidIconKey, isValidIconSet, assertOwnerOrFM, assertInstanceOwner } from '../common/icons';

@Injectable()
export class IconsService {
  constructor(private prisma: PrismaService) {}

  // Every family member (and the kiosk) needs this to render AppIcon, so it's
  // one cheap bundled read rather than three round trips: the fully-resolved
  // map every icon-key renders with right now, plus the two raw override
  // layers (only the keys each tier has explicitly set) so the Settings UI
  // can show "inherited" vs "overridden" and offer a reset-to-default.
  async effective(familyId: string) {
    const [appRows, familyRows] = await Promise.all([
      this.prisma.appIconSetting.findMany(),
      this.prisma.familyIconSetting.findMany({ where: { familyId } }),
    ]);
    const appSet: Record<string, string> = {};
    for (const r of appRows) appSet[r.iconKey] = r.iconSet;
    const familySet: Record<string, string> = {};
    for (const r of familyRows) familySet[r.iconKey] = r.iconSet;

    const effective: Record<string, string> = {};
    for (const key of ICON_KEYS) {
      effective[key] = familySet[key] ?? appSet[key] ?? DEFAULT_ICON_SET;
    }
    return { effective, familySet, appSet };
  }

  async setFamilyOverride(familyId: string, actorId: string, iconKey: string, iconSet: string | null) {
    await assertOwnerOrFM(this.prisma, actorId);
    if (!isValidIconKey(iconKey)) throw new BadRequestException('Unknown icon');
    if (iconSet !== null && !isValidIconSet(iconSet)) throw new BadRequestException('Unknown icon set');

    if (iconSet === null) {
      await this.prisma.familyIconSetting.deleteMany({ where: { familyId, iconKey } });
      return { ok: true };
    }
    await this.prisma.familyIconSetting.upsert({
      where: { familyId_iconKey: { familyId, iconKey } },
      create: { familyId, iconKey, iconSet },
      update: { iconSet },
    });
    return { ok: true };
  }

  async setAppDefault(actorId: string, iconKey: string, iconSet: string | null) {
    await assertInstanceOwner(this.prisma, actorId);
    if (!isValidIconKey(iconKey)) throw new BadRequestException('Unknown icon');
    if (iconSet !== null && !isValidIconSet(iconSet)) throw new BadRequestException('Unknown icon set');

    if (iconSet === null) {
      await this.prisma.appIconSetting.deleteMany({ where: { iconKey } });
      return { ok: true };
    }
    await this.prisma.appIconSetting.upsert({
      where: { iconKey },
      create: { iconKey, iconSet },
      update: { iconSet },
    });
    return { ok: true };
  }
}
