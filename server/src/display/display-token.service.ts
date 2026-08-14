import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (!user || (user.role !== 'OWNER' && user.role !== 'FAMILY_MANAGER')) {
      throw new ForbiddenException('Only the owner or a family manager can manage display tokens');
    }
  }

  // Returns the raw token exactly once; only the hash is stored.
  async mint(familyId: string, userId: string, label?: string, displayConfigId?: string) {
    await this.assertOwner(userId);
    // Never trusted the caller's displayConfigId belonged to their own
    // family - an owner ghosted/switched between families (or just a bad
    // request) could mint a token scoped to THEIR familyId that points at
    // someone else's display config, which the kiosk this token ends up on
    // would then never resolve correctly (or worse, silently show the wrong
    // family's config, if a future lookup ever forgot to filter by family).
    if (displayConfigId) {
      const config = await this.prisma.displayConfig.findFirst({ where: { id: displayConfigId, familyId } });
      if (!config) throw new BadRequestException('That display does not belong to this family');
    }
    const raw = randomBytes(24).toString('hex');
    const record = await this.prisma.displayToken.create({
      data: { familyId, tokenHash: this.hash(raw), label, displayConfigId: displayConfigId ?? null },
    });
    return { id: record.id, label: record.label, token: raw };
  }

  async list(familyId: string) {
    // No real pagination UI here - a family realistically mints a handful of
    // these ever, not hundreds - but an unbounded query with no cap at all
    // was still the wrong default; 200 is a defensive ceiling, not a page size.
    const tokens = await this.prisma.displayToken.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
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

  // Only the hash is ever stored, so a lost/closed-before-copying link can't
  // be recovered - this mints a fresh one bound to the same display/label
  // and revokes the old, same net effect as "show me that link again"
  // without ever keeping a usable token sitting in the database.
  async regenerate(familyId: string, userId: string, id: string) {
    await this.assertOwner(userId);
    const existing = await this.prisma.displayToken.findFirst({ where: { id, familyId } });
    if (!existing) throw new BadRequestException('Kiosk link not found');
    await this.prisma.displayToken.update({ where: { id }, data: { revokedAt: new Date() } });
    const raw = randomBytes(24).toString('hex');
    const record = await this.prisma.displayToken.create({
      data: { familyId, tokenHash: this.hash(raw), label: existing.label, displayConfigId: existing.displayConfigId },
    });
    return { id: record.id, label: record.label, token: raw };
  }

  // revoke() only ever soft-disables (kiosks accumulate forever otherwise -
  // no list view ever shrank on its own). This is the real delete, and
  // deliberately restricted to already-revoked rows: hard-removing an
  // ACTIVE token by mistake would brick a kiosk with no warning beyond
  // "the screen goes blank" the next time it happens to reload. Revoke
  // first, then delete, is the only path - same two-step safety as
  // deactivate-then-delete-a-person elsewhere in this app.
  async delete(familyId: string, userId: string, id: string) {
    await this.assertOwner(userId);
    const existing = await this.prisma.displayToken.findFirst({ where: { id, familyId } });
    if (!existing) throw new NotFoundException('Kiosk link not found');
    if (!existing.revokedAt) throw new BadRequestException('Revoke this link before deleting it');
    await this.prisma.displayToken.delete({ where: { id } });
    return { ok: true };
  }

  async deleteAllRevoked(familyId: string, userId: string) {
    await this.assertOwner(userId);
    const { count } = await this.prisma.displayToken.deleteMany({ where: { familyId, revokedAt: { not: null } } });
    return { ok: true, count };
  }

  // Resolve a raw token to its family + which display config it shows.
  async resolve(raw: string): Promise<{ familyId: string; displayConfigId: string | null } | null> {
    const token = await this.prisma.displayToken.findFirst({
      where: { tokenHash: this.hash(raw), revokedAt: null },
    });
    return token ? { familyId: token.familyId, displayConfigId: token.displayConfigId } : null;
  }
}
