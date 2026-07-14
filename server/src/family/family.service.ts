import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FamilyService {
  constructor(private prisma: PrismaService) {}

  async settings(familyId: string) {
    const f = await this.prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    return { id: f.id, name: f.name, tokenName: f.tokenName };
  }

  async update(actorId: string, familyId: string, data: { name?: string; tokenName?: string }) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.role !== 'OWNER') throw new ForbiddenException('Owner only');
    const f = await this.prisma.family.update({
      where: { id: familyId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.tokenName !== undefined && { tokenName: data.tokenName || 'Tokens' }),
      },
    });
    return { id: f.id, name: f.name, tokenName: f.tokenName };
  }
}
