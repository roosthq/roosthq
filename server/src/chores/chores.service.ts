import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateChoreDto {
  title: string;
  assignmentType?: 'SPECIFIC' | 'ANYONE';
  assigneeUserIds?: string[];
  locationId?: string;
  tokenValue?: number;
  recurrenceRule?: string;
  dayOfWeek?: number;
  checklist?: string[];
  dueDate?: string;
}

export type UpdateChoreDto = Partial<CreateChoreDto>;

function nextWeekday(dow: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

function nextDue(rule: string | null, from: Date): Date | null {
  const d = new Date(from);
  switch (rule) {
    case 'DAILY':
      d.setDate(d.getDate() + 1);
      return d;
    case 'WEEKLY':
      d.setDate(d.getDate() + 7);
      return d;
    case 'BIWEEKLY':
      d.setDate(d.getDate() + 14);
      return d;
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1);
      return d;
    default:
      return null;
  }
}

function firstDueDate(dto: { dueDate?: string; dayOfWeek?: number }): Date {
  if (dto.dueDate) return new Date(dto.dueDate);
  if (dto.dayOfWeek != null) return nextWeekday(dto.dayOfWeek);
  return new Date();
}

const CHORE_INCLUDE = {
  checklist: { orderBy: { sort: 'asc' as const } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatar: true } } } },
  location: true,
  instances: { orderBy: { dueDate: 'desc' as const }, take: 5, include: { checks: true } },
};

@Injectable()
export class ChoresService {
  constructor(private prisma: PrismaService) {}

  private async user(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
  private isAdult(role?: string) {
    return role === 'OWNER' || role === 'ADULT';
  }
  private async assertAdult(userId: string) {
    const u = await this.user(userId);
    if (!this.isAdult(u?.role)) throw new ForbiddenException('Adults only');
    return u!;
  }

  private async ownedChore(familyId: string, id: string) {
    const chore = await this.prisma.chore.findFirst({ where: { id, familyId }, include: { assignees: true } });
    if (!chore) throw new NotFoundException('Chore not found');
    return chore;
  }

  private async ownedInstance(familyId: string, instanceId: string) {
    const inst = await this.prisma.choreInstance.findUnique({
      where: { id: instanceId },
      include: { chore: { include: { checklist: true, assignees: true } }, checks: true },
    });
    if (!inst || inst.chore.familyId !== familyId) throw new NotFoundException('Instance not found');
    return inst;
  }

  async create(familyId: string, createdById: string, dto: CreateChoreDto) {
    await this.assertAdult(createdById);
    const assignmentType = dto.assignmentType === 'ANYONE' ? 'ANYONE' : 'SPECIFIC';
    const chore = await this.prisma.chore.create({
      data: {
        familyId,
        title: dto.title,
        assignmentType,
        dayOfWeek: dto.dayOfWeek ?? null,
        locationId: dto.locationId,
        tokenValue: dto.tokenValue ?? 0,
        recurrenceRule: dto.recurrenceRule,
        createdById,
        assignees:
          assignmentType === 'SPECIFIC' && dto.assigneeUserIds?.length
            ? { create: dto.assigneeUserIds.map((userId) => ({ userId })) }
            : undefined,
        checklist: dto.checklist?.length
          ? { create: dto.checklist.map((label, i) => ({ label, sort: i })) }
          : undefined,
      },
    });
    await this.prisma.choreInstance.create({
      data: { choreId: chore.id, dueDate: firstDueDate(dto) },
    });
    return this.getChore(familyId, chore.id);
  }

  getChore(familyId: string, id: string) {
    return this.prisma.chore.findFirst({ where: { id, familyId }, include: CHORE_INCLUDE });
  }

  // Everyone in the family can see all chores.
  list(familyId: string) {
    return this.prisma.chore.findMany({ where: { familyId }, include: CHORE_INCLUDE });
  }

  async update(familyId: string, userId: string, id: string, dto: UpdateChoreDto) {
    await this.assertAdult(userId);
    await this.ownedChore(familyId, id);
    const assignmentType =
      dto.assignmentType === 'ANYONE' ? 'ANYONE' : dto.assignmentType === 'SPECIFIC' ? 'SPECIFIC' : undefined;

    await this.prisma.chore.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(assignmentType && { assignmentType }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.tokenValue !== undefined && { tokenValue: dto.tokenValue }),
        ...(dto.recurrenceRule !== undefined && { recurrenceRule: dto.recurrenceRule }),
      },
    });

    if (dto.assigneeUserIds) {
      await this.prisma.choreAssignee.deleteMany({ where: { choreId: id } });
      const type = assignmentType ?? (await this.prisma.chore.findUnique({ where: { id } }))?.assignmentType;
      if (type === 'SPECIFIC' && dto.assigneeUserIds.length) {
        await this.prisma.choreAssignee.createMany({
          data: dto.assigneeUserIds.map((userId2) => ({ choreId: id, userId: userId2 })),
        });
      }
    }

    if (dto.checklist) {
      await this.prisma.choreChecklist.deleteMany({ where: { choreId: id } });
      if (dto.checklist.length) {
        await this.prisma.choreChecklist.createMany({
          data: dto.checklist.map((label, i) => ({ choreId: id, label, sort: i })),
        });
      }
    }
    return this.getChore(familyId, id);
  }

  async remove(familyId: string, userId: string, id: string) {
    await this.assertAdult(userId);
    await this.ownedChore(familyId, id);
    await this.prisma.chore.delete({ where: { id } });
    return { ok: true };
  }

  // Whether a user may act on (complete/check) an instance.
  private canAct(chore: { assignmentType: string; assignees: { userId: string }[] }, inst: { claimedByUserId: string | null }, userId: string) {
    if (chore.assignmentType === 'ANYONE') return inst.claimedByUserId === userId;
    return chore.assignees.some((a) => a.userId === userId);
  }

  // Claim an open ("anyone") chore occurrence.
  async claim(familyId: string, userId: string, instanceId: string) {
    const inst = await this.ownedInstance(familyId, instanceId);
    if (inst.chore.assignmentType !== 'ANYONE') throw new BadRequestException('This chore is not open to claim');
    if (inst.claimedByUserId && inst.claimedByUserId !== userId) {
      throw new BadRequestException('Already claimed by someone else');
    }
    return this.prisma.choreInstance.update({ where: { id: instanceId }, data: { claimedByUserId: userId } });
  }

  async checkItem(familyId: string, userId: string, instanceId: string, checklistId: string, checked: boolean) {
    const inst = await this.ownedInstance(familyId, instanceId);
    if (!this.canAct(inst.chore, inst, userId)) throw new ForbiddenException('Not your chore');
    if (checked) {
      await this.prisma.choreItemCheck.upsert({
        where: { choreInstanceId_checklistId: { choreInstanceId: instanceId, checklistId } },
        update: {},
        create: { choreInstanceId: instanceId, checklistId },
      });
    } else {
      await this.prisma.choreItemCheck.deleteMany({ where: { choreInstanceId: instanceId, checklistId } });
    }
    return { ok: true };
  }

  // Mark done. Only the assignee/claimer can. Can't complete a future occurrence
  // (enforces once-per-period). Adults completing their own chore self-approve.
  async complete(familyId: string, userId: string, instanceId: string) {
    const inst = await this.ownedInstance(familyId, instanceId);
    if (inst.status !== 'OPEN') throw new BadRequestException('This chore is not open');

    // Auto-claim an ANYONE chore for the person completing it.
    if (inst.chore.assignmentType === 'ANYONE' && !inst.claimedByUserId) {
      await this.prisma.choreInstance.update({ where: { id: instanceId }, data: { claimedByUserId: userId } });
      inst.claimedByUserId = userId;
    }
    if (!this.canAct(inst.chore, inst, userId)) throw new ForbiddenException('Not your chore');

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (inst.dueDate > endOfToday) {
      throw new BadRequestException('Not available yet — this occurrence is scheduled for later.');
    }

    const required = inst.chore.checklist.filter((c) => c.required).map((c) => c.id);
    const done = new Set(inst.checks.map((c) => c.checklistId));
    if (required.some((r) => !done.has(r))) {
      throw new BadRequestException('Complete all required checklist items first');
    }

    const actor = await this.user(userId);
    // Adults don't need approval for their own chores.
    if (this.isAdult(actor?.role)) {
      return this.finalizeApproval(inst.id, userId, userId);
    }
    return this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'PENDING', completedAt: new Date(), claimedByUserId: inst.claimedByUserId ?? userId },
    });
  }

  async approve(familyId: string, approverId: string, instanceId: string) {
    await this.assertAdult(approverId);
    const inst = await this.ownedInstance(familyId, instanceId);
    return this.finalizeApproval(inst.id, approverId, inst.claimedByUserId ?? undefined);
  }

  // Shared approval path: mark approved, award tokens to whoever did it, spawn next.
  private async finalizeApproval(instanceId: string, approverId: string, recipientUserId?: string) {
    const inst = await this.prisma.choreInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: { chore: true },
    });
    const updated = await this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: {
        status: 'APPROVED',
        approvedBy: approverId,
        completedAt: inst.completedAt ?? new Date(),
        claimedByUserId: inst.claimedByUserId ?? recipientUserId ?? null,
      },
    });
    const recipient = inst.claimedByUserId ?? recipientUserId;
    if (recipient && inst.chore.tokenValue > 0) {
      await this.prisma.tokenLedger.create({
        data: {
          userId: recipient,
          delta: inst.chore.tokenValue,
          reason: `Chore approved: ${inst.chore.title}`,
          type: 'CHORE',
          refId: inst.id,
          createdById: approverId,
        },
      });
    }
    const due = nextDue(inst.chore.recurrenceRule, inst.dueDate);
    if (due) await this.prisma.choreInstance.create({ data: { choreId: inst.chore.id, dueDate: due } });
    return updated;
  }

  async reject(familyId: string, approverId: string, instanceId: string) {
    await this.assertAdult(approverId);
    await this.ownedInstance(familyId, instanceId);
    return this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'OPEN', completedAt: null },
    });
  }

  // Adult re-enables a chore to be done again now (even a periodic one already done),
  // by creating a fresh open occurrence due today.
  async reopen(familyId: string, actorId: string, choreId: string) {
    await this.assertAdult(actorId);
    await this.ownedChore(familyId, choreId);
    return this.prisma.choreInstance.create({ data: { choreId, dueDate: new Date() } });
  }

  async balances(familyId: string) {
    const grouped = await this.prisma.tokenLedger.groupBy({
      by: ['userId'],
      _sum: { delta: true },
      where: { user: { familyId } },
    });
    return grouped.map((g) => ({ userId: g.userId, balance: g._sum.delta ?? 0 }));
  }
}
