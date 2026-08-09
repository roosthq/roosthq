import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Instance-owner action trail. No FK to User on purpose — the record has to
// survive the actor or target being deleted, which is exactly the kind of
// action this logs. Best-effort: a logging failure should never roll back or
// block the action it's describing.
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async record(entry: { actorId: string; actorName: string; action: string; targetId?: string; targetLabel?: string; detail?: string }) {
    await this.prisma.auditLog
      .create({
        data: {
          actorId: entry.actorId,
          actorName: entry.actorName,
          action: entry.action,
          targetId: entry.targetId,
          targetLabel: entry.targetLabel,
          detail: entry.detail,
        },
      })
      .catch(() => undefined);
  }

  list(limit = 200) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
