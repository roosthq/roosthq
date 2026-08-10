import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../common/timezone';

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
    return this.prisma.location.create({ data: { familyId, name, timezone: DEFAULT_TIMEZONE } });
  }

  // Also covers timezone - everything time-related for chores at this
  // location (due dates, "missed" checks) is computed in it.
  async update(familyId: string, id: string, data: { name?: string; timezone?: string }) {
    await this.owned(familyId, id);
    if (data.timezone !== undefined && !isValidTimeZone(data.timezone)) {
      throw new BadRequestException('Not a real IANA timezone name');
    }
    return this.prisma.location.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
      },
    });
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

  // Self-service version of assign/unassign above - the caller sets their
  // OWN full set of locations in one call (My Account, and the "pick your
  // location(s)" join modal for anyone with none yet). Unlike assign(), which
  // takes an arbitrary userId, this can never touch anyone else's rows.
  async selfJoin(familyId: string, userId: string, locationIds: string[]) {
    const ids = [...new Set(locationIds)];
    if (!ids.length) throw new BadRequestException('Pick at least one location');
    const valid = await this.prisma.location.findMany({ where: { familyId, id: { in: ids } }, select: { id: true } });
    if (valid.length !== ids.length) throw new BadRequestException('Location not found');
    await this.prisma.userLocation.deleteMany({ where: { userId, locationId: { notIn: ids } } });
    await Promise.all(
      ids.map((locationId) =>
        this.prisma.userLocation.upsert({
          where: { userId_locationId: { userId, locationId } },
          update: {},
          create: { userId, locationId },
        }),
      ),
    );
    return { ok: true };
  }

  private async owned(familyId: string, id: string) {
    const loc = await this.prisma.location.findFirst({ where: { id, familyId } });
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }
}
