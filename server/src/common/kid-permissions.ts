import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Per-kid ability switches (User.disabledPermissions — KID_PERMISSIONS in
// web/src/api.ts). Stored as the DISABLED list so a kid can do everything
// until an adult turns something off, and so new permissions default to
// allowed without a backfill. Adults are never restricted by these.
export async function assertKidPermission(prisma: PrismaService, userId: string, permission: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, disabledPermissions: true } });
  if (!u) throw new ForbiddenException();
  if (u.role !== 'KID') return;
  const disabled = Array.isArray(u.disabledPermissions) ? (u.disabledPermissions as string[]) : [];
  if (disabled.includes(permission)) throw new ForbiddenException("You don't have permission for that");
}
