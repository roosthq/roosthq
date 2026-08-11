import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { sanitizeSoundAssignments } from '../common/features';

// Same hard caps the client enforces (sounds.ts upload flow) - max 4s, max
// ~250KB raw. Checked again here since the client's own limit is only ever
// a courtesy; base64 inflates ~4/3, so cap the encoded string a bit above
// that to leave room for the "data:audio/...;base64," prefix.
const MAX_DATA_URI_LENGTH = 400_000;

@Injectable()
export class SoundsService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnerOrFM(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'FAMILY_MANAGER')) {
      throw new ForbiddenException('Owner or family manager only');
    }
  }

  list(familyId: string) {
    return this.prisma.customSound.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, label: true, dataUri: true, createdAt: true },
    });
  }

  async create(familyId: string, actorId: string, dto: { label: string; dataUri: string }) {
    await this.assertOwnerOrFM(actorId);
    if (!dto.label?.trim()) throw new BadRequestException('Give this sound a name');
    if (!dto.dataUri?.startsWith('data:audio/')) throw new BadRequestException('Not a valid audio file');
    if (dto.dataUri.length > MAX_DATA_URI_LENGTH) {
      throw new BadRequestException('That clip is too big - keep custom sounds under ~250KB');
    }
    return this.prisma.customSound.create({
      data: { familyId, label: dto.label.trim(), dataUri: dto.dataUri, createdById: actorId },
      select: { id: true, label: true, dataUri: true, createdAt: true },
    });
  }

  async remove(familyId: string, actorId: string, id: string) {
    await this.assertOwnerOrFM(actorId);
    const s = await this.prisma.customSound.findFirst({ where: { id, familyId } });
    if (!s) throw new NotFoundException('Sound not found');
    await this.prisma.customSound.delete({ where: { id } });
    // Strip any slot that pointed at this now-deleted upload so a stale
    // assignment doesn't silently fall back to nothing at playback time.
    const family = await this.prisma.family.findUniqueOrThrow({ where: { id: familyId }, select: { soundAssignments: true } });
    const remainingCustomIds = (await this.prisma.customSound.findMany({ where: { familyId }, select: { id: true } })).map((c) => c.id);
    const cleaned = sanitizeSoundAssignments(family.soundAssignments, remainingCustomIds);
    await this.prisma.family.update({ where: { id: familyId }, data: { soundAssignments: cleaned as unknown as Prisma.InputJsonValue } });
    return { ok: true };
  }
}
