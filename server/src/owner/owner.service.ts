import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashPassword } from '../crypto/password';
import { AuditLogService } from '../security/audit-log.service';

// Instance-level powers, deliberately gated on the literal OWNER role (not
// FAMILY_MANAGER) - multi-family management and ghosting reach across every
// family in the instance, not just one, so they stay narrower than the
// per-family role split added alongside this.
@Injectable()
export class OwnerService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
    return u;
  }

  auditLog(actorId: string) {
    // Read access is the same bar as everything else here.
    return this.assertOwner(actorId).then(() => this.audit.list());
  }

  async listFamilies(actorId: string) {
    await this.assertOwner(actorId);
    const families = await this.prisma.family.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return families.map((f) => ({ id: f.id, name: f.name, memberCount: f._count.users, createdAt: f.createdAt }));
  }

  async createFamily(actorId: string, name: string) {
    await this.assertOwner(actorId);
    if (!name?.trim()) throw new BadRequestException('Name is required');
    // Explicit values instead of leaning on the Prisma/MySQL column DEFAULT -
    // a value supplied through the app's own connection always goes through
    // the driver's configured utf8mb4 charset; a column-level DEFAULT is
    // applied by MySQL itself using whatever charset was active when the
    // table/column was created, which can silently mangle a 4-byte emoji
    // default (🪙) into tofu on a brand-new family even though every other
    // write path (which always supplies its own value) renders it fine.
    const family = await this.prisma.family.create({
      data: { name: name.trim(), tokenName: 'Tokens', tokenIcon: '🪙', tokenValueUsd: 1, choreWord: 'Chore' },
    });
    const owner = await this.prisma.user.findUnique({ where: { id: actorId } });
    await this.audit.record({
      actorId,
      actorName: owner?.displayName ?? 'Owner',
      action: 'family.create',
      targetId: family.id,
      targetLabel: family.name,
    });
    return { id: family.id, name: family.name, memberCount: 0, createdAt: family.createdAt };
  }

  // Owner-only rename - the family's own members can rename their reward
  // currency, chore word, etc. from Settings, but the family's own NAME is
  // instance-level identity (it's what tells families apart in this panel),
  // so only the owner touches it.
  async renameFamily(actorId: string, familyId: string, name: string) {
    const owner = await this.assertOwner(actorId);
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Name is required');
    const family = await this.prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new NotFoundException('Family not found');
    if (trimmed === family.name) return { id: family.id, name: family.name };
    const updated = await this.prisma.family.update({ where: { id: familyId }, data: { name: trimmed } });
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: 'family.rename',
      targetId: family.id,
      targetLabel: updated.name,
      detail: `"${family.name}" -> "${updated.name}"`,
    });
    return { id: updated.id, name: updated.name };
  }

  // Owner-only, and only when empty - deleting a family with members would
  // orphan them (no cascade is desirable here; a family with people in it
  // should be emptied via moveUser/removeUser first, deliberately, not as a
  // side effect of deleting the family).
  async deleteFamily(actorId: string, familyId: string) {
    const owner = await this.assertOwner(actorId);
    const family = await this.prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new NotFoundException('Family not found');
    const memberCount = await this.prisma.user.count({ where: { familyId } });
    if (memberCount > 0) throw new BadRequestException('This family still has members - move or remove them first');
    await this.prisma.family.delete({ where: { id: familyId } });
    await this.audit.record({ actorId, actorName: owner.displayName, action: 'family.delete', targetId: familyId, targetLabel: family.name });
    return { ok: true };
  }

  async familyMembers(actorId: string, familyId: string) {
    await this.assertOwner(actorId);
    return this.prisma.user.findMany({
      where: { familyId },
      select: { id: true, displayName: true, role: true, avatar: true, email: true, username: true, active: true },
      orderBy: { displayName: 'asc' },
    });
  }

  // Lock an account out (or let it back in) without touching its history -
  // the gate in main.ts refuses every request from an inactive user.
  async setUserActive(actorId: string, targetUserId: string, active: boolean) {
    const owner = await this.assertOwner(actorId);
    if (targetUserId === actorId) throw new BadRequestException("You can't deactivate your own account");
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');
    // Never leave the instance with no way in.
    if (!active && target.role === 'OWNER') {
      const activeOwners = await this.prisma.user.count({ where: { role: 'OWNER', active: true } });
      if (activeOwners <= 1) throw new BadRequestException('That is the only active owner left');
    }
    await this.prisma.user.update({ where: { id: targetUserId }, data: { active } });
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: active ? 'user.reactivate' : 'user.deactivate',
      targetId: target.id,
      targetLabel: target.displayName,
    });
    return { ok: true, active };
  }

  // Hard delete. Everything of theirs cascades (ledger, assignments, awards
  // received, notifications) - deactivation is the reversible option and the
  // UI says so.
  async deleteUser(actorId: string, targetUserId: string) {
    const owner = await this.assertOwner(actorId);
    if (targetUserId === actorId) throw new BadRequestException("You can't delete your own account here");
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') {
      const owners = await this.prisma.user.count({ where: { role: 'OWNER' } });
      if (owners <= 1) throw new BadRequestException('That is the only owner left');
    }
    await this.prisma.user.delete({ where: { id: targetUserId } });
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: 'user.delete',
      targetId: target.id,
      targetLabel: target.displayName,
      detail: `role: ${target.role}`,
    });
    return { ok: true };
  }

  // Create an account in any family, no invite involved - the owner-side
  // counterpart of Settings > "add directly". A password is optional (they can
  // sign in with Google on the matching email, or get one set later).
  async createUser(
    actorId: string,
    input: {
      familyId: string;
      role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID';
      displayName: string;
      email?: string;
      username?: string;
      password?: string;
    },
  ) {
    const owner = await this.assertOwner(actorId);
    const family = await this.prisma.family.findUnique({ where: { id: input.familyId } });
    if (!family) throw new NotFoundException('Family not found');
    const displayName = input.displayName?.trim();
    if (!displayName) throw new BadRequestException('Name is required');
    const email = input.email?.trim() || undefined;
    const username = input.username?.trim() || undefined;
    // Same rule as the invite/settings path: a grown-up needs a way to sign in.
    if (input.role !== 'KID' && !email && !username) {
      throw new BadRequestException('An adult needs an email address or a username to sign in with');
    }
    if (username) {
      const taken = await this.prisma.user.findUnique({ where: { username } });
      if (taken) throw new BadRequestException('That username is already taken');
    }
    if (input.password && input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const passwordHash = input.password ? hashPassword(input.password) : undefined;
    const created = await this.prisma.user.create({
      data: {
        familyId: input.familyId,
        role: input.role,
        displayName,
        email,
        username,
        passwordHash,
      },
      select: { id: true, displayName: true, role: true, email: true, username: true, active: true },
    });
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: 'user.create',
      targetId: created.id,
      targetLabel: created.displayName,
      detail: `role: ${created.role} · family: ${family.name}`,
    });
    return created;
  }

  // Move an existing member into a different family, assigning their role
  // there. Location/calendar shares are family-scoped and don't carry any
  // meaning in the destination family, so they're dropped; chore assignments
  // to chores outside the new family are dropped the same way (the chore
  // itself is untouched - just this one now-cross-family assignment).
  // `role` accepts 'OWNER' too - safe with no extra check because
  // assertOwner above already guarantees the actor calling this IS an
  // owner (multiple owners, additive: this never touches the actor's own
  // role, so granting someone else OWNER never demotes the person doing it).
  async moveUser(actorId: string, targetUserId: string, familyId: string, role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID') {
    const owner = await this.assertOwner(actorId);
    const family = await this.prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new NotFoundException('Family not found');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('The owner cannot be moved between families');

    await this.prisma.$transaction([
      this.prisma.userLocation.deleteMany({ where: { userId: targetUserId } }),
      this.prisma.calendarShare.deleteMany({ where: { userId: targetUserId } }),
      this.prisma.choreAssignee.deleteMany({
        where: { userId: targetUserId, chore: { familyId: { not: familyId } } },
      }),
      this.prisma.user.update({ where: { id: targetUserId }, data: { familyId, role } }),
    ]);
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: 'user.move',
      targetId: target.id,
      targetLabel: target.displayName,
      detail: `-> ${family.name} as ${role}`,
    });
    return { ok: true };
  }

  // Mint a session acting as `targetUserId`, stamping who's really behind it
  // so the UI can show a "Ghosting as X" banner and offer a way back. Doubles
  // as "switch family" (pick any member of another family) and "ghost into a
  // specific account" (pick a kid vs an adult) - same mechanism either way.
  async ghost(actorId: string, targetUserId: string) {
    const owner = await this.assertOwner(actorId);
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');
    // Acting as someone else is exactly the kind of thing an audit trail is
    // for, even though it's routine here for testing - no side effects on
    // the target's data, just a record of who looked.
    await this.audit.record({ actorId, actorName: owner.displayName, action: 'ghost.start', targetId: target.id, targetLabel: target.displayName });
    return { userId: target.id, familyId: target.familyId, ghostedBy: actorId };
  }

  // Rebuild the real owner's own session from the ghostedBy id stamped into
  // the current one - re-checked against the DB (role could theoretically
  // have changed mid-ghost) rather than trusted blindly from the token.
  async unghost(ghostedBy: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ghostedBy } });
    if (!owner || owner.role !== 'OWNER') throw new ForbiddenException('Not a valid owner session');
    return { userId: owner.id, familyId: owner.familyId };
  }
}
