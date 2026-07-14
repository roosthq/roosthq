import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  list(familyId: string) {
    return this.prisma.location.findMany({
      where: { familyId },
      include: { users: { select: { userId: true } } },
    });
  }

  create(familyId: string, name: string) {
    return this.prisma.location.create({ data: { familyId, name } });
  }

  async rename(familyId: string, id: string, name: string) {
    await this.owned(familyId, id);
    return this.prisma.location.update({ where: { id }, data: { name } });
  }

  async remove(familyId: string, id: string) {
    await this.owned(familyId, id);
    await this.prisma.location.delete({ where: { id } });
    return { ok: true };
  }

  // Assign a location to a user. Adults typically get one; kids can have several.
  async assign(familyId: string, id: string, userId: string) {
    await this.owned(familyId, id);
    await this.prisma.userLocation.upsert({
      where: { userId_locationId: { userId, locationId: id } },
      update: {},
      create: { userId, locationId: id },
    });
    return { ok: true };
  }

  async unassign(familyId: string, id: string, userId: string) {
    await this.owned(familyId, id);
    await this.prisma.userLocation.deleteMany({ where: { locationId: id, userId } });
    return { ok: true };
  }

  private async owned(familyId: string, id: string) {
    const loc = await this.prisma.location.findFirst({ where: { id, familyId } });
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }
}
