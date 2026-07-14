import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateChoreDto {
  title: string;
  assigneeUserId: string;
  locationId?: string;
  tokenValue?: number;
  recurrenceRule?: string; // DAILY | WEEKLY | BIWEEKLY | MONTHLY | null (single) | custom
  dayOfWeek?: number; // 0=Sun..6=Sat; anchors the first instance to that weekday
  checklist?: string[];
  dueDate?: string;
}

// Next date (>= today) that falls on the given weekday (0=Sun..6=Sat).
function nextWeekday(dow: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

export type UpdateChoreDto = Partial<
  Pick<CreateChoreDto, 'title' | 'assigneeUserId' | 'locationId' | 'tokenValue' | 'recurrenceRule'>
>;

// Compute the next due date for a recurring chore. Unknown/custom rules return
// null (no auto-generated next instance).
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

@Injectable()
export class ChoresService {
  constructor(private prisma: PrismaService) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== 'OWNER' && u.role !== 'ADULT')) {
      throw new ForbiddenException('Adults only');
    }
    return u;
  }

  private async ownedChore(familyId: string, id: string) {
    const chore = await this.prisma.chore.findFirst({ where: { id, familyId } });
    if (!chore) throw new NotFoundException('Chore not found');
    return chore;
  }

  private async ownedInstance(familyId: string, instanceId: string) {
    const inst = await this.prisma.choreInstance.findUnique({
      where: { id: instanceId },
      include: { chore: { include: { checklist: true } }, checks: true },
    });
    if (!inst || inst.chore.familyId !== familyId) throw new NotFoundException('Instance not found');
    return inst;
  }

  async create(familyId: string, createdById: string, dto: CreateChoreDto) {
    await this.assertAdult(createdById);
    const chore = await this.prisma.chore.create({
      data: {
        familyId,
        title: dto.title,
        assigneeUserId: dto.assigneeUserId,
        locationId: dto.locationId,
        tokenValue: dto.tokenValue ?? 0,
        recurrenceRule: dto.recurrenceRule,
        createdById,
        checklist: dto.checklist?.length
          ? { create: dto.checklist.map((label, i) => ({ label, sort: i })) }
          : undefined,
      },
    });
    // Seed the first instance. Priority: explicit dueDate, else a chosen weekday
    // (which weekly/biweekly recurrence then keeps to), else today.
    const firstDue = dto.dueDate
      ? new Date(dto.dueDate)
      : dto.dayOfWeek != null
        ? nextWeekday(dto.dayOfWeek)
        : new Date();
    await this.prisma.choreInstance.create({
      data: { choreId: chore.id, dueDate: firstDue },
    });
    return this.getChore(familyId, chore.id);
  }

  getChore(familyId: string, id: string) {
    return this.prisma.chore.findFirst({
      where: { id, familyId },
      include: {
        checklist: { orderBy: { sort: 'asc' } },
        assignee: { select: { id: true, displayName: true } },
        location: true,
        instances: { orderBy: { dueDate: 'desc' }, include: { checks: true } },
      },
    });
  }

  list(familyId: string, filter?: { assigneeUserId?: string; locationId?: string }) {
    return this.prisma.chore.findMany({
      where: {
        familyId,
        ...(filter?.assigneeUserId && { assigneeUserId: filter.assigneeUserId }),
        ...(filter?.locationId && { locationId: filter.locationId }),
      },
      include: {
        checklist: { orderBy: { sort: 'asc' } },
        assignee: { select: { id: true, displayName: true } },
        location: true,
        instances: { orderBy: { dueDate: 'desc' }, take: 5, include: { checks: true } },
      },
    });
  }

  async update(familyId: string, userId: string, id: string, dto: UpdateChoreDto) {
    await this.assertAdult(userId);
    await this.ownedChore(familyId, id);
    await this.prisma.chore.update({ where: { id }, data: dto });
    return this.getChore(familyId, id);
  }

  async remove(familyId: string, userId: string, id: string) {
    await this.assertAdult(userId);
    await this.ownedChore(familyId, id);
    await this.prisma.chore.delete({ where: { id } });
    return { ok: true };
  }

  // Kid ticks / unticks a checklist item on an instance.
  async checkItem(familyId: string, instanceId: string, checklistId: string, checked: boolean) {
    await this.ownedInstance(familyId, instanceId);
    if (checked) {
      await this.prisma.choreItemCheck.upsert({
        where: { choreInstanceId_checklistId: { choreInstanceId: instanceId, checklistId } },
        update: {},
        create: { choreInstanceId: instanceId, checklistId },
      });
    } else {
      await this.prisma.choreItemCheck.deleteMany({
        where: { choreInstanceId: instanceId, checklistId },
      });
    }
    return { ok: true };
  }

  // Kid marks an instance done -> PENDING (awaiting adult approval).
  async complete(familyId: string, instanceId: string) {
    const inst = await this.ownedInstance(familyId, instanceId);
    const required = inst.chore.checklist.filter((c) => c.required).map((c) => c.id);
    const done = new Set(inst.checks.map((c) => c.checklistId));
    if (required.some((r) => !done.has(r))) {
      throw new BadRequestException('Complete all required checklist items first');
    }
    return this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'PENDING', completedAt: new Date() },
    });
  }

  // Adult approves -> award tokens to the assignee and spawn the next instance.
  async approve(familyId: string, approverId: string, instanceId: string) {
    await this.assertAdult(approverId);
    const inst = await this.ownedInstance(familyId, instanceId);
    const updated = await this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'APPROVED', approvedBy: approverId },
    });
    if (inst.chore.tokenValue > 0) {
      await this.prisma.tokenLedger.create({
        data: {
          userId: inst.chore.assigneeUserId,
          delta: inst.chore.tokenValue,
          reason: `Chore approved: ${inst.chore.title}`,
          type: 'CHORE',
          refId: inst.id,
          createdById: approverId,
        },
      });
    }
    const due = nextDue(inst.chore.recurrenceRule, inst.dueDate);
    if (due) {
      await this.prisma.choreInstance.create({ data: { choreId: inst.chore.id, dueDate: due } });
    }
    return updated;
  }

  // Adult rejects -> back to OPEN.
  async reject(familyId: string, approverId: string, instanceId: string) {
    await this.assertAdult(approverId);
    await this.ownedInstance(familyId, instanceId);
    return this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'OPEN', completedAt: null },
    });
  }

  // Token balances for the whole family (balance derived from the ledger).
  async balances(familyId: string) {
    const grouped = await this.prisma.tokenLedger.groupBy({
      by: ['userId'],
      _sum: { delta: true },
      where: { user: { familyId } },
    });
    return grouped.map((g) => ({ userId: g.userId, balance: g._sum.delta ?? 0 }));
  }
}
