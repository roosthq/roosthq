import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { isValidIconKey, isValidIconSet, isValidSlotId, assertOwnerOrFM, assertInstanceOwner } from '../common/icons';

export interface SlotPick {
  iconKey: string;
  iconSet: string;
}

@Injectable()
export class IconsService {
  constructor(private prisma: PrismaService) {}

  // Sparse: only slots that actually have a family or app override appear
  // here. A slot with no entry means "render this position's own hardcoded
  // default" - the client already knows that default, so there's nothing
  // useful for the server to say about it.
  async effective(familyId: string) {
    const [appRows, familyRows] = await Promise.all([
      this.prisma.appSlotIcon.findMany(),
      this.prisma.familySlotIcon.findMany({ where: { familyId } }),
    ]);
    const appSlots: Record<string, SlotPick> = {};
    for (const r of appRows) appSlots[r.slotId] = { iconKey: r.iconKey, iconSet: r.iconSet };
    const familySlots: Record<string, SlotPick> = {};
    for (const r of familyRows) familySlots[r.slotId] = { iconKey: r.iconKey, iconSet: r.iconSet };

    const effective: Record<string, SlotPick> = { ...appSlots, ...familySlots };
    return { effective, familySlots, appSlots };
  }

  async setFamilySlot(familyId: string, actorId: string, slotId: string, pick: SlotPick | null) {
    await assertOwnerOrFM(this.prisma, actorId);
    if (!isValidSlotId(slotId)) throw new BadRequestException('Unknown slot');

    if (pick === null) {
      await this.prisma.familySlotIcon.deleteMany({ where: { familyId, slotId } });
      return { ok: true };
    }
    if (!isValidIconKey(pick.iconKey)) throw new BadRequestException('Unknown icon');
    if (!isValidIconSet(pick.iconSet)) throw new BadRequestException('Unknown icon set');

    await this.prisma.familySlotIcon.upsert({
      where: { familyId_slotId: { familyId, slotId } },
      create: { familyId, slotId, iconKey: pick.iconKey, iconSet: pick.iconSet },
      update: { iconKey: pick.iconKey, iconSet: pick.iconSet },
    });
    return { ok: true };
  }

  async setAppSlot(actorId: string, slotId: string, pick: SlotPick | null) {
    await assertInstanceOwner(this.prisma, actorId);
    if (!isValidSlotId(slotId)) throw new BadRequestException('Unknown slot');

    if (pick === null) {
      await this.prisma.appSlotIcon.deleteMany({ where: { slotId } });
      return { ok: true };
    }
    if (!isValidIconKey(pick.iconKey)) throw new BadRequestException('Unknown icon');
    if (!isValidIconSet(pick.iconSet)) throw new BadRequestException('Unknown icon set');

    await this.prisma.appSlotIcon.upsert({
      where: { slotId },
      create: { slotId, iconKey: pick.iconKey, iconSet: pick.iconSet },
      update: { iconKey: pick.iconKey, iconSet: pick.iconSet },
    });
    return { ok: true };
  }
}
