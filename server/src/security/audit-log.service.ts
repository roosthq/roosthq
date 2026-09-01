import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { paginate } from '../common/pagination';

// Instance-owner action trail. No FK to User on purpose - the record has to
// survive the actor or target being deleted, which is exactly the kind of
// action this logs. Best-effort: a logging failure should never roll back or
// block the action it's describing.
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async record(entry: {
    actorId: string;
    actorName: string;
    action: string;
    targetId?: string;
    targetLabel?: string;
    detail?: string;
    familyId?: string;
  }) {
    await this.prisma.auditLog
      .create({
        data: {
          actorId: entry.actorId,
          actorName: entry.actorName,
          action: entry.action,
          targetId: entry.targetId,
          targetLabel: entry.targetLabel,
          detail: entry.detail,
          familyId: entry.familyId,
        },
      })
      .catch(() => undefined);
  }

  async list(skip = 0, take = 50) {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: take + 1 });
    return paginate(rows, take);
  }

  // Per-entity change history (e.g. one chore's create/edit/delete trail).
  // Always pass the caller's own familyId - targetId alone is an opaque id;
  // without this filter a guessed/enumerated id from another family would
  // work just as well, including for a target that's since been deleted and
  // so can't be re-checked against its own row anymore.
  listForTarget(targetId: string, familyId: string, limit = 200) {
    return this.prisma.auditLog.findMany({ where: { targetId, familyId }, orderBy: { createdAt: 'desc' }, take: limit });
  }

  // All rows for one action, scoped to a family - e.g. every "chore.delete"
  // entry, so a caller can build a "deleted chores" picker even though the
  // chores themselves are long gone and have no row left to list from.
  listByAction(familyId: string, action: string, limit = 200) {
    return this.prisma.auditLog.findMany({ where: { familyId, action }, orderBy: { createdAt: 'desc' }, take: limit });
  }
}
