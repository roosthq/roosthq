import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DisplayTokenService {
  constructor(private prisma: PrismaService) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async assertOwner(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'OWNER') {
      throw new ForbiddenException('Only the family owner can manage display tokens');
    }
  }

  // Returns the raw token exactly once; only the hash is stored.
  async mint(familyId: string, userId: string, label?: string, displayConfigId?: string) {
    await this.assertOwner(userId);
    const raw = randomBytes(24).toString('hex');
    const record = await this.prisma.displayToken.create({
      data: { familyId, tokenHash: this.hash(raw), label, displayConfigId: displayConfigId ?? null },
    });
    return { id: record.id, label: record.label, token: raw };
  }

  async list(familyId: string) {
    const tokens = await this.prisma.displayToken.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
    });
    return tokens.map((t) => ({
      id: t.id,
      label: t.label,
      displayConfigId: t.displayConfigId,
      createdAt: t.createdAt,
      revokedAt: t.revokedAt,
    }));
  }

  async revoke(familyId: string, userId: string, id: string) {
    await this.assertOwner(userId);
    await this.prisma.displayToken.updateMany({
      where: { id, familyId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  // Resolve a raw token to its family + which display config it shows.
  async resolve(raw: string): Promise<{ familyId: string; displayConfigId: string | null } | null> {
    const token = await this.prisma.displayToken.findFirst({
      where: { tokenHash: this.hash(raw), revokedAt: null },
    });
    return token ? { familyId: token.familyId, displayConfigId: token.displayConfigId } : null;
  }
}
