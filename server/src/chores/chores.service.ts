import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DEFAULT_TIMEZONE,
  addDaysToKey,
  addMonthsToKey,
  dateKeyInZone,
  dowOfKey,
  endOfDayInZone,
  startOfDayInZone,
  todayKeyInZone,
} from '../common/timezone';

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
  allowLate?: boolean;
  latePenaltyPercent?: number;
  streakGoal?: number | null;
  streakBonusTokens?: number;
}

export type UpdateChoreDto = Partial<CreateChoreDto>;

function clampPercent(v: number | undefined, fallback: number): number {
  if (v == null || Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Every due date produced here is end-of-day (23:59:59.999) in the chore's
// own location's timezone, not the server process's ambient one (UTC in the
// Docker image) — that mismatch is what made due times render as ~5-6pm the
// day before on a Mountain Time family's screen.
function nextWeekday(dow: number, tz: string): Date {
  const today = todayKeyInZone(tz);
  const add = (dow - dowOfKey(today) + 7) % 7;
  return endOfDayInZone(addDaysToKey(today, add), tz);
}

function nextDue(rule: string | null, from: Date, tz: string): Date | null {
  const key = dateKeyInZone(from, tz);
  switch (rule) {
    case 'DAILY':
      return endOfDayInZone(addDaysToKey(key, 1), tz);
    case 'WEEKLY':
      return endOfDayInZone(addDaysToKey(key, 7), tz);
    case 'BIWEEKLY':
      return endOfDayInZone(addDaysToKey(key, 14), tz);
    case 'MONTHLY':
      return endOfDayInZone(addMonthsToKey(key, 1), tz);
    default:
      return null;
  }
}

// Day-of-week only anchors weekly-style chores (or a one-time "do it on X").
// Daily/monthly chores start today so they can be done immediately.
function firstDueDate(dto: { dueDate?: string; dayOfWeek?: number; recurrenceRule?: string }, tz: string): Date {
  if (dto.dueDate) return endOfDayInZone(dateKeyInZone(new Date(dto.dueDate), tz), tz);
  const weekdayApplies = !dto.recurrenceRule || dto.recurrenceRule === 'WEEKLY' || dto.recurrenceRule === 'BIWEEKLY';
  if (dto.dayOfWeek != null && weekdayApplies) return nextWeekday(dto.dayOfWeek, tz);
  return endOfDayInZone(todayKeyInZone(tz), tz);
}

const CHORE_INCLUDE = {
  checklist: { orderBy: { sort: 'asc' as const } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatar: true } } } },
  location: true,
  instances: { orderBy: { dueDate: 'desc' as const }, take: 5, include: { checks: true } },
};

@Injectable()
export class ChoresService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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

  // The timezone due-date math for a chore should use — its location's, or
  // the instance-wide default if it has none / isn't scoped to one.
  private async resolveTimezone(locationId?: string | null): Promise<string> {
    if (!locationId) return DEFAULT_TIMEZONE;
    const loc = await this.prisma.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
    return loc?.timezone || DEFAULT_TIMEZONE;
  }

  private async ownedChore(familyId: string, id: string) {
    const chore = await this.prisma.chore.findFirst({ where: { id, familyId }, include: { assignees: true } });
    if (!chore) throw new NotFoundException('Chore not found');
    return chore;
  }

  private async ownedInstance(familyId: string, instanceId: string) {
    const inst = await this.prisma.choreInstance.findUnique({
      where: { id: instanceId },
      include: { chore: { include: { checklist: true, assignees: true, location: true } }, checks: true },
    });
    if (!inst || inst.chore.familyId !== familyId) throw new NotFoundException('Instance not found');
    return inst;
  }

  async create(familyId: string, createdById: string, dto: CreateChoreDto) {
    await this.assertAdult(createdById);
    const tz = await this.resolveTimezone(dto.locationId);
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
        allowLate: dto.allowLate ?? false,
        latePenaltyPercent: clampPercent(dto.latePenaltyPercent, 25),
        streakGoal: dto.streakGoal ?? null,
        streakBonusTokens: Math.max(0, dto.streakBonusTokens ?? 0),
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
      data: { choreId: chore.id, dueDate: firstDueDate(dto, tz) },
    });
    return this.getChore(familyId, chore.id);
  }

  async getChore(familyId: string, id: string) {
    await this.sweepMissed(familyId);
    return this.prisma.chore.findFirst({ where: { id, familyId }, include: CHORE_INCLUDE });
  }

  // Everyone in the family can see all chores.
  async list(familyId: string) {
    await this.sweepMissed(familyId);
    return this.prisma.chore.findMany({ where: { familyId }, include: CHORE_INCLUDE });
  }

  // No cron: this runs whenever anyone loads chores. Any OPEN instance whose due
  // date has fully passed, on a chore that doesn't allow late credit, forfeits its
  // reward (-> MISSED) and — since the next occurrence otherwise only ever gets
  // created on approval — spawns the next one so the schedule doesn't freeze.
  private async sweepMissed(familyId: string) {
    // Different chores can have different location timezones, so "start of
    // today" isn't one cutoff for the whole family — fetch anything overdue
    // by any zone's reckoning (dueDate < now is always a safe superset) and
    // decide per-instance below using that chore's own zone.
    const now = new Date();
    const stale = await this.prisma.choreInstance.findMany({
      where: { status: 'OPEN', dueDate: { lt: now }, chore: { familyId, allowLate: false } },
      include: { chore: { include: { assignees: true, location: true } } },
    });
    for (const inst of stale) {
      const tz = inst.chore.location?.timezone || DEFAULT_TIMEZONE;
      const startOfToday = startOfDayInZone(todayKeyInZone(tz), tz);
      if (inst.dueDate >= startOfToday) continue; // still due later today in its own zone

      await this.prisma.choreInstance.update({ where: { id: inst.id }, data: { status: 'MISSED' } });
      if (inst.chore.currentStreak !== 0) {
        await this.prisma.chore.update({ where: { id: inst.choreId }, data: { currentStreak: 0 } });
      }
      const recipients = inst.claimedByUserId ? [inst.claimedByUserId] : inst.chore.assignees.map((a) => a.userId);
      await Promise.all(
        recipients.map((uid) =>
          this.notifications.create(familyId, uid, 'CHORE_MISSED', `Missed: "${inst.chore.title}"`, { link: '/chores' }),
        ),
      );
      const due = nextDue(inst.chore.recurrenceRule, inst.dueDate, tz);
      if (due) await this.prisma.choreInstance.create({ data: { choreId: inst.choreId, dueDate: due } });
    }
  }

  async update(familyId: string, userId: string, id: string, dto: UpdateChoreDto) {
    await this.assertAdult(userId);
    const before = await this.ownedChore(familyId, id);
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
        ...(dto.allowLate !== undefined && { allowLate: dto.allowLate }),
        ...(dto.latePenaltyPercent !== undefined && { latePenaltyPercent: clampPercent(dto.latePenaltyPercent, 25) }),
        ...(dto.streakGoal !== undefined && { streakGoal: dto.streakGoal }),
        ...(dto.streakBonusTokens !== undefined && { streakBonusTokens: Math.max(0, dto.streakBonusTokens) }),
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

    // nextDue() just adds a fixed interval to the previous instance's dueDate —
    // it never re-derives from dayOfWeek. So without this, changing "which day"
    // a chore falls on only updates the label; the actual still-open occurrence
    // (and everything generated after it) keeps running on the old schedule.
    // Only re-anchor when the day/rule actually changed (not just resent
    // unchanged by the edit form), and only touch an instance nobody has acted
    // on yet — never PENDING/APPROVED — so a manual "Enable again" grace
    // instance isn't silently snapped back by an unrelated edit.
    const dayChanged = dto.dayOfWeek !== undefined && dto.dayOfWeek !== before.dayOfWeek;
    const ruleChanged = dto.recurrenceRule !== undefined && dto.recurrenceRule !== before.recurrenceRule;
    if (dayChanged || ruleChanged) {
      const fresh = await this.prisma.chore.findUniqueOrThrow({ where: { id } });
      const openInst = await this.prisma.choreInstance.findFirst({
        where: { choreId: id, status: 'OPEN' },
        orderBy: { dueDate: 'desc' },
      });
      if (openInst) {
        const tz = await this.resolveTimezone(fresh.locationId);
        const newDue = firstDueDate(
          { dayOfWeek: fresh.dayOfWeek ?? undefined, recurrenceRule: fresh.recurrenceRule ?? undefined },
          tz,
        );
        await this.prisma.choreInstance.update({ where: { id: openInst.id }, data: { dueDate: newDue } });
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

  // Adult assigns (or clears, userId=null) who a claimed occurrence belongs to.
  async setClaim(familyId: string, actorId: string, instanceId: string, userId: string | null) {
    await this.assertAdult(actorId);
    await this.ownedInstance(familyId, instanceId);
    return this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { claimedByUserId: userId },
    });
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

    const tz = inst.chore.location?.timezone || DEFAULT_TIMEZONE;
    const today = todayKeyInZone(tz);
    const startOfToday = startOfDayInZone(today, tz);
    const endOfToday = endOfDayInZone(today, tz);
    if (inst.dueDate > endOfToday) {
      throw new BadRequestException('Not available yet — this occurrence is scheduled for later.');
    }
    // Belt-and-suspenders: the periodic sweep (see sweepMissed) normally flips a
    // stale instance to MISSED before this is ever reachable from the UI, but
    // don't rely on that having already run.
    if (!inst.chore.allowLate && inst.dueDate < startOfToday) {
      throw new BadRequestException('This chore was missed and can no longer be completed.');
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
    const updated = await this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'PENDING', completedAt: new Date(), claimedByUserId: inst.claimedByUserId ?? userId },
    });
    await this.notifications.notifyAdults(
      inst.chore.familyId,
      'CHORE_PENDING',
      `${actor?.displayName ?? 'Someone'} finished "${inst.chore.title}" — needs approval`,
      { link: '/chores' },
    );
    return updated;
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
      include: { chore: { include: { location: true } } },
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
    const completedAt = inst.completedAt ?? new Date();
    const daysLate = Math.max(0, Math.floor((completedAt.getTime() - inst.dueDate.getTime()) / 86_400_000));
    if (recipient && inst.chore.tokenValue > 0) {
      const penaltyPct = Math.min(100, daysLate * inst.chore.latePenaltyPercent);
      const awarded = Math.floor(inst.chore.tokenValue * (1 - penaltyPct / 100));
      if (awarded > 0) {
        await this.prisma.tokenLedger.create({
          data: {
            userId: recipient,
            delta: awarded,
            reason:
              daysLate > 0
                ? `Chore approved: ${inst.chore.title} (${daysLate}d late, ${100 - penaltyPct}% reward)`
                : `Chore approved: ${inst.chore.title}`,
            type: 'CHORE',
            refId: inst.id,
            createdById: approverId,
          },
        });
      }
    }

    // Streak: on-time keeps it going (and can trigger a bonus); late — even
    // when allowed — breaks it, since the point is consistency.
    if (recipient) {
      if (daysLate === 0) {
        const currentStreak = inst.chore.currentStreak + 1;
        const bestStreak = Math.max(inst.chore.bestStreak, currentStreak);
        await this.prisma.chore.update({ where: { id: inst.chore.id }, data: { currentStreak, bestStreak } });
        if (inst.chore.streakGoal && inst.chore.streakBonusTokens > 0 && currentStreak % inst.chore.streakGoal === 0) {
          await this.prisma.tokenLedger.create({
            data: {
              userId: recipient,
              delta: inst.chore.streakBonusTokens,
              reason: `Streak bonus: ${inst.chore.title} (${currentStreak} in a row)`,
              type: 'STREAK_BONUS',
              refId: inst.id,
              createdById: approverId,
            },
          });
          await this.notifications.create(
            inst.chore.familyId,
            recipient,
            'STREAK_BONUS',
            `${currentStreak} in a row on "${inst.chore.title}"! Bonus tokens awarded.`,
            { link: '/chores' },
          );
        }
      } else if (inst.chore.currentStreak !== 0) {
        await this.prisma.chore.update({ where: { id: inst.chore.id }, data: { currentStreak: 0 } });
      }
    }

    if (recipient && approverId !== recipient) {
      await this.notifications.create(inst.chore.familyId, recipient, 'CHORE_APPROVED', `"${inst.chore.title}" was approved`, {
        link: '/chores',
      });
    }

    const due = nextDue(inst.chore.recurrenceRule, inst.dueDate, inst.chore.location?.timezone || DEFAULT_TIMEZONE);
    if (due) await this.prisma.choreInstance.create({ data: { choreId: inst.chore.id, dueDate: due } });
    return updated;
  }

  async reject(familyId: string, approverId: string, instanceId: string) {
    await this.assertAdult(approverId);
    const inst = await this.ownedInstance(familyId, instanceId);
    const updated = await this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'OPEN', completedAt: null },
    });
    if (inst.claimedByUserId) {
      await this.notifications.create(familyId, inst.claimedByUserId, 'CHORE_REJECTED', `"${inst.chore.title}" was sent back — try again`, {
        link: '/chores',
      });
    }
    return updated;
  }

  // Adult re-enables a chore to be done again now (even a periodic one already done),
  // by creating a fresh open occurrence due today.
  async reopen(familyId: string, actorId: string, choreId: string) {
    await this.assertAdult(actorId);
    const chore = await this.ownedChore(familyId, choreId);
    const tz = await this.resolveTimezone(chore.locationId);
    const due = endOfDayInZone(todayKeyInZone(tz), tz);
    // Re-use an already-open instance instead of stacking a second one on top of
    // it — clicking "Enable again" more than once shouldn't leave two open
    // occurrences (e.g. this week's normal cycle and a manual one) alive at once.
    const existing = await this.prisma.choreInstance.findFirst({ where: { choreId, status: 'OPEN' } });
    if (existing) {
      return this.prisma.choreInstance.update({ where: { id: existing.id }, data: { dueDate: due } });
    }
    return this.prisma.choreInstance.create({ data: { choreId, dueDate: due } });
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
