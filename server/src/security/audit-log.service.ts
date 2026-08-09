import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Instance-owner action trail. No FK to User on purpose — the record has to
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

  list(limit = 200) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  // Per-entity change history (e.g. one chore's create/edit/delete trail).
  // Always pass the caller's own familyId — targetId alone is an opaque id;
  // without this filter a guessed/enumerated id from another family would
  // work just as well, including for a target that's since been deleted and
  // so can't be re-checked against its own row anymore.
  listForTarget(targetId: string, familyId: string, limit = 200) {
    return this.prisma.auditLog.findMany({ where: { targetId, familyId }, orderBy: { createdAt: 'desc' }, take: limit });
  }
}
