import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DisplayEventsService } from '../display/display-events.service';
import {
  DEFAULT_TIMEZONE,
  addDaysToKey,
  addMonthsToKey,
  dateKeyInZone,
  dowOfKey,
  dueInstant,
  endOfDayInZone,
  startOfDayInZone,
  todayKeyInZone,
  type DateKey,
} from '../common/timezone';

export interface CreateChoreDto {
  title: string;
  assignmentType?: 'SPECIFIC' | 'ANYONE';
  assigneeUserIds?: string[];
  locationId?: string;
  tokenValue?: number;
  recurrenceRule?: string;
  dayOfWeek?: number;
  daysOfWeek?: number[];
  dueTime?: string | null;
  checklist?: string[];
  dueDate?: string;
  allowLate?: boolean;
  allowSkip?: boolean;
  latePenaltyPercent?: number;
  streakGoal?: number | null;
  streakBonusTokens?: number;
}

export type UpdateChoreDto = Partial<CreateChoreDto>;

function clampPercent(v: number | undefined, fallback: number): number {
  if (v == null || Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// A chore's `daysOfWeek` (new, multi-day) always wins when set; `dayOfWeek`
// (legacy single-day column) is read only for rows created before it
// existed, so old chores keep resolving exactly as before.
function resolveDaysOfWeek(chore: { daysOfWeek: unknown; dayOfWeek: number | null }): number[] {
  if (Array.isArray(chore.daysOfWeek) && chore.daysOfWeek.length) return chore.daysOfWeek as number[];
  return chore.dayOfWeek != null ? [chore.dayOfWeek] : [];
}

// Every due date produced here resolves through dueInstant() — dueTime's
// wall-clock time in the chore's own location timezone if set, otherwise
// end-of-day (23:59:59.999) — never the server process's ambient timezone
// (UTC in the Docker image), which is what made due times render as ~5-6pm
// the day before on a Mountain Time family's screen.

// Smallest offset (0-6) from `fromKey` that lands on a day in `days`,
// optionally requiring the match be strictly after `fromKey` itself (so a
// completed Monday occurrence advances to Wednesday, not back to Monday).
function offsetToNextDayInSet(fromDow: number, days: number[], strictlyAfter: boolean): number {
  let best = 7;
  for (const d of days) {
    let offset = (d - fromDow + 7) % 7;
    if (strictlyAfter && offset === 0) offset = 7;
    if (offset < best) best = offset;
  }
  return best === 7 ? 0 : best;
}

// Next occurrence of ANY day in `days` strictly after `fromKey` (wraps into
// next week if needed) — the general form of "next weekday" that also
// handles a Mon/Wed/Fri-style pattern, not just a single anchor day.
function nextDayInSetAfter(fromKey: DateKey, days: number[]): DateKey {
  return addDaysToKey(fromKey, offsetToNextDayInSet(dowOfKey(fromKey), days, true));
}

// Same as above but "today counts" — used for the very first occurrence, so
// a chore due today shows up today instead of a week from now.
function nextDayInSetFrom(fromKey: DateKey, days: number[]): DateKey {
  return addDaysToKey(fromKey, offsetToNextDayInSet(dowOfKey(fromKey), days, false));
}

function nextDue(rule: string | null, from: Date, daysOfWeek: number[], dueTime: string | null | undefined, tz: string): Date | null {
  const key = dateKeyInZone(from, tz);
  // A real day pattern (2+ days) always advances within/across the week to
  // the next matching day — "Mon-Fri homework" needs Tue after Mon, not a
  // flat +7. A single day (0 or 1 entries) keeps the exact legacy interval
  // math per rule, so nothing about existing chores changes.
  if (daysOfWeek.length > 1) return dueInstant(nextDayInSetAfter(key, daysOfWeek), dueTime, tz);
  switch (rule) {
    case 'DAILY':
      return dueInstant(addDaysToKey(key, 1), dueTime, tz);
    case 'WEEKLY':
      return dueInstant(addDaysToKey(key, 7), dueTime, tz);
    case 'BIWEEKLY':
      return dueInstant(addDaysToKey(key, 14), dueTime, tz);
    case 'MONTHLY':
      return dueInstant(addMonthsToKey(key, 1), dueTime, tz);
    default:
      return null;
  }
}

// Day-of-week only anchors weekly-style chores (or a one-time "do it on X").
// Daily/monthly chores start today so they can be done immediately.
function firstDueDate(
  dto: { dueDate?: string; daysOfWeek?: number[]; dueTime?: string | null; recurrenceRule?: string },
  tz: string,
): Date {
  if (dto.dueDate) return dueInstant(dateKeyInZone(new Date(dto.dueDate), tz), dto.dueTime, tz);
  const weekdayApplies = !dto.recurrenceRule || dto.recurrenceRule === 'WEEKLY' || dto.recurrenceRule === 'BIWEEKLY';
  if (dto.daysOfWeek?.length && weekdayApplies) {
    return dueInstant(nextDayInSetFrom(todayKeyInZone(tz), dto.daysOfWeek), dto.dueTime, tz);
  }
  return dueInstant(todayKeyInZone(tz), dto.dueTime, tz);
}

type StaleInstance = Prisma.ChoreInstanceGetPayload<{
  include: { chore: { include: { assignees: true; location: true } } };
}>;

const CHORE_INCLUDE = {
  checklist: { orderBy: { sort: 'asc' as const } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatar: true } } } },
  location: true,
  instances: {
    orderBy: { dueDate: 'desc' as const },
    take: 5,
    include: { checks: true, approvedByUser: { select: { id: true, displayName: true } } },
  },
};

// Who approved a completion is adult-only context — a kid sees the same
// instance data minus that one field.
function stripApprover<T extends { instances: Array<Record<string, unknown>> }>(chores: T[]): T[] {
  return chores.map((c) => ({
    ...c,
    instances: c.instances.map(({ approvedByUser, ...rest }) => rest),
  })) as T[];
}

@Injectable()
export class ChoresService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
  ) {}

  private async user(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
  private isAdult(role?: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
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

  // Creates the "next" instance for a chore, silently no-oping if one already
  // exists at that exact due date — the DB's @@unique([choreId, dueDate]) is
  // the actual guard (sweepMissed/pollDueDates/finalizeApproval can all race
  // to spawn the same next occurrence); this just turns that race's loser
  // into a no-op instead of a 500.
  private async createNextInstance(choreId: string, dueDate: Date) {
    try {
      await this.prisma.choreInstance.create({ data: { choreId, dueDate } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      throw e;
    }
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
    // A SPECIFIC chore with nobody picked is assigned to no one and claimable
    // by no one — it'd exist in the DB but never match any group in the UI,
    // effectively vanishing with no way to find or edit it again.
    if (assignmentType === 'SPECIFIC' && !dto.assigneeUserIds?.length) {
      throw new BadRequestException('Pick at least one person, or switch to "Open to anyone".');
    }
    const chore = await this.prisma.chore.create({
      data: {
        familyId,
        title: dto.title,
        assignmentType,
        dayOfWeek: dto.dayOfWeek ?? null,
        daysOfWeek: dto.daysOfWeek?.length ? dto.daysOfWeek : undefined,
        dueTime: dto.dueTime ?? null,
        locationId: dto.locationId,
        tokenValue: dto.tokenValue ?? 0,
        recurrenceRule: dto.recurrenceRule,
        allowLate: dto.allowLate ?? false,
        allowSkip: dto.allowSkip ?? false,
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
    this.displayEvents.publish(familyId, { type: 'chores' });
    return this.getChore(familyId, chore.id);
  }

  async getChore(familyId: string, id: string) {
    await this.sweepMissed(familyId);
    return this.prisma.chore.findFirst({ where: { id, familyId }, include: CHORE_INCLUDE });
  }

  // Owner/family manager see every chore, unscoped. A plain adult sees the
  // same household scoping a kid does — chores with no location, or one of
  // their own locations, plus (regardless of location) anything actually
  // assigned to them, so a cross-household assignment or an
  // upcoming/missed occurrence they can still act on never disappears.
  // Only kids get the approver field stripped — a plain adult still sees it.
  async list(familyId: string, actingUserId: string) {
    await this.sweepMissed(familyId);
    const chores = await this.prisma.chore.findMany({ where: { familyId }, include: CHORE_INCLUDE });
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId }, include: { locations: true } });
    if (!actor) return chores;
    const isTopManager = actor.role === 'OWNER' || actor.role === 'FAMILY_MANAGER';
    let result = chores;
    if (!isTopManager) {
      const myLocationIds = new Set(actor.locations.map((l) => l.locationId));
      result = chores.filter(
        (c) => !c.locationId || myLocationIds.has(c.locationId) || c.assignees.some((a) => a.userId === actingUserId),
      );
    }
    return actor.role === 'KID' ? stripApprover(result) : result;
  }

  // Runs whenever anyone loads chores, as a belt-and-suspenders alongside the
  // timer-based sweep below (pollDueDates) — so a family whose app instance
  // somehow missed a poll still self-heals the moment someone opens the page.
  private async sweepMissed(familyId: string) {
    const stale = await this.prisma.choreInstance.findMany({
      where: { status: 'OPEN', dueDate: { lt: new Date() }, chore: { familyId, allowLate: false } },
      include: { chore: { include: { assignees: true, location: true } } },
    });
    for (const inst of stale) await this.markMissedAndAdvance(inst);
  }

  // Any OPEN instance whose due date has fully passed, on a chore that doesn't
  // allow late credit, forfeits its reward (-> MISSED) and — since the next
  // occurrence otherwise only ever gets created on approval — spawns the next
  // one so the schedule doesn't freeze.
  //
  // dueDate is already a precise, zone-correct absolute instant (computed via
  // dueInstant() when it was set), so "dueDate < now" needs no further
  // per-instance zone handling — comparing two absolute instants is
  // zone-agnostic by construction.
  private async markMissedAndAdvance(inst: StaleInstance) {
    // Clear the claim too — for an ANYONE chore, missing it shouldn't leave
    // it stuck looking claimed by someone who didn't do it; the notify-the-
    // claimant logic just below still reads the pre-update `inst` in memory,
    // so this doesn't affect who gets told about the miss.
    await this.prisma.choreInstance.update({ where: { id: inst.id }, data: { status: 'MISSED', claimedByUserId: null } });
    if (inst.chore.currentStreak !== 0) {
      await this.prisma.chore.update({ where: { id: inst.choreId }, data: { currentStreak: 0 } });
    }
    const recipients = inst.claimedByUserId ? [inst.claimedByUserId] : inst.chore.assignees.map((a) => a.userId);
    await Promise.all(
      recipients.map((uid) =>
        this.notifications.create(inst.chore.familyId, uid, 'CHORE_MISSED', `Missed: "${inst.chore.title}"`, { link: '/chores' }),
      ),
    );
    const tz = inst.chore.location?.timezone || DEFAULT_TIMEZONE;
    const due = nextDue(inst.chore.recurrenceRule, inst.dueDate, resolveDaysOfWeek(inst.chore), inst.chore.dueTime, tz);
    if (due) await this.createNextInstance(inst.choreId, due);
    this.displayEvents.publish(inst.chore.familyId, { type: 'chores' });
  }

  // Warning thresholds (minutes before due) — 2h, then hourly, then 30/15min,
  // then CHORE_MISSED (see markMissedAndAdvance) tells them they blew it.
  private static readonly DUE_SOON_THRESHOLDS = [120, 60, 30, 15];

  private dueSoonLabel(minutes: number): string {
    return minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
  }

  // Runs on a timer (no dependency on anyone having the app open) so both the
  // missed-sweep and the due-soon warnings fire on time. See sweepMissed for
  // why the same missed-handling also runs opportunistically per-request.
  @Interval(60_000)
  async pollDueDates() {
    const now = new Date();
    const overdue = await this.prisma.choreInstance.findMany({
      where: { status: 'OPEN', dueDate: { lt: now }, chore: { allowLate: false } },
      include: { chore: { include: { assignees: true, location: true } } },
    });
    for (const inst of overdue) await this.markMissedAndAdvance(inst);

    const horizon = new Date(now.getTime() + ChoresService.DUE_SOON_THRESHOLDS[0] * 60_000);
    const dueSoon = await this.prisma.choreInstance.findMany({
      where: { status: 'OPEN', dueDate: { gte: now, lte: horizon } },
      include: { chore: { include: { assignees: true } } },
    });
    for (const inst of dueSoon) {
      const minutesLeft = (inst.dueDate.getTime() - now.getTime()) / 60_000;
      const candidates = ChoresService.DUE_SOON_THRESHOLDS.filter(
        (t) => minutesLeft <= t && (inst.warnedThreshold == null || t < inst.warnedThreshold),
      );
      if (!candidates.length) continue;
      const threshold = Math.min(...candidates);
      await this.prisma.choreInstance.update({ where: { id: inst.id }, data: { warnedThreshold: threshold } });
      const recipients = inst.claimedByUserId ? [inst.claimedByUserId] : inst.chore.assignees.map((a) => a.userId);
      await Promise.all(
        recipients.map((uid) =>
          this.notifications.create(
            inst.chore.familyId,
            uid,
            'CHORE_DUE_SOON',
            `"${inst.chore.title}" is due in ${this.dueSoonLabel(threshold)}`,
            { link: '/chores' },
          ),
        ),
      );
    }
  }

  async update(familyId: string, userId: string, id: string, dto: UpdateChoreDto) {
    await this.assertAdult(userId);
    const before = await this.ownedChore(familyId, id);
    const assignmentType =
      dto.assignmentType === 'ANYONE' ? 'ANYONE' : dto.assignmentType === 'SPECIFIC' ? 'SPECIFIC' : undefined;
    // Same rule as create(): a SPECIFIC chore can't end up with nobody
    // assigned — check the effective state after this edit, not just what
    // this particular request happened to touch.
    const effectiveAssigneeCount = dto.assigneeUserIds !== undefined ? dto.assigneeUserIds.length : before.assignees.length;
    if ((assignmentType ?? before.assignmentType) === 'SPECIFIC' && effectiveAssigneeCount === 0) {
      throw new BadRequestException('Pick at least one person, or switch to "Open to anyone".');
    }

    const updateData: Prisma.ChoreUncheckedUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title }),
        ...(assignmentType && { assignmentType }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.daysOfWeek !== undefined && { daysOfWeek: dto.daysOfWeek?.length ? dto.daysOfWeek : Prisma.JsonNull }),
        ...(dto.dueTime !== undefined && { dueTime: dto.dueTime }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.tokenValue !== undefined && { tokenValue: dto.tokenValue }),
        ...(dto.recurrenceRule !== undefined && { recurrenceRule: dto.recurrenceRule }),
        ...(dto.allowLate !== undefined && { allowLate: dto.allowLate }),
        ...(dto.allowSkip !== undefined && { allowSkip: dto.allowSkip }),
        ...(dto.latePenaltyPercent !== undefined && { latePenaltyPercent: clampPercent(dto.latePenaltyPercent, 25) }),
        ...(dto.streakGoal !== undefined && { streakGoal: dto.streakGoal }),
        ...(dto.streakBonusTokens !== undefined && { streakBonusTokens: Math.max(0, dto.streakBonusTokens) }),
    };
    await this.prisma.chore.update({ where: { id }, data: updateData });

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
    const daysChanged = dto.daysOfWeek !== undefined && JSON.stringify(dto.daysOfWeek ?? []) !== JSON.stringify(resolveDaysOfWeek(before));
    const ruleChanged = dto.recurrenceRule !== undefined && dto.recurrenceRule !== before.recurrenceRule;
    const dueTimeChanged = dto.dueTime !== undefined && dto.dueTime !== before.dueTime;
    if (dayChanged || daysChanged || ruleChanged || dueTimeChanged) {
      const fresh = await this.prisma.chore.findUniqueOrThrow({ where: { id } });
      const openInst = await this.prisma.choreInstance.findFirst({
        where: { choreId: id, status: 'OPEN' },
        orderBy: { dueDate: 'desc' },
      });
      if (openInst) {
        const tz = await this.resolveTimezone(fresh.locationId);
        const newDue = firstDueDate(
          { daysOfWeek: resolveDaysOfWeek(fresh), dueTime: fresh.dueTime, recurrenceRule: fresh.recurrenceRule ?? undefined },
          tz,
        );
        await this.prisma.choreInstance.update({ where: { id: openInst.id }, data: { dueDate: newDue } });
      }
    }

    this.displayEvents.publish(familyId, { type: 'chores' });
    return this.getChore(familyId, id);
  }

  async remove(familyId: string, userId: string, id: string) {
    await this.assertAdult(userId);
    await this.ownedChore(familyId, id);
    await this.prisma.chore.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'chores' });
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
    const updated = await this.prisma.choreInstance.update({ where: { id: instanceId }, data: { claimedByUserId: userId } });
    this.displayEvents.publish(familyId, { type: 'chores' });
    return updated;
  }

  // Adult assigns (or clears, userId=null) who a claimed occurrence belongs to.
  async setClaim(familyId: string, actorId: string, instanceId: string, userId: string | null) {
    await this.assertAdult(actorId);
    await this.ownedInstance(familyId, instanceId);
    const updated = await this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { claimedByUserId: userId },
    });
    this.displayEvents.publish(familyId, { type: 'chores' });
    return updated;
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
    this.displayEvents.publish(familyId, { type: 'chores' });
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
    const endOfToday = endOfDayInZone(todayKeyInZone(tz), tz);
    if (inst.dueDate > endOfToday) {
      throw new BadRequestException('Not available yet — this occurrence is scheduled for later.');
    }
    // Belt-and-suspenders: the periodic sweep (see sweepMissed) normally flips a
    // stale instance to MISSED before this is ever reachable from the UI, but
    // don't rely on that having already run. dueDate is now the precise deadline
    // instant (end-of-day or an explicit dueTime), so a direct comparison suffices.
    if (!inst.chore.allowLate && inst.dueDate < new Date()) {
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
    this.displayEvents.publish(familyId, { type: 'chores' });
    return updated;
  }

  // Assignee (or the claimer, for an ANYONE chore) deliberately skips this
  // occurrence instead of doing it — for a chore that's genuinely optional
  // some days (chore.allowSkip), e.g. homework that isn't assigned every
  // night. No approval step, no checklist requirement (skip is an
  // alternative to completing, not a shortcut through it), no token, and
  // the streak carries through untouched — a skip isn't a failure the way
  // a miss is, so it neither continues nor breaks it.
  async skip(familyId: string, userId: string, instanceId: string) {
    const inst = await this.ownedInstance(familyId, instanceId);
    if (!inst.chore.allowSkip) throw new BadRequestException('Skipping is not allowed for this chore');
    if (inst.status !== 'OPEN') throw new BadRequestException('This chore is not open');

    // Auto-claim an ANYONE chore for the person skipping it — same as complete().
    if (inst.chore.assignmentType === 'ANYONE' && !inst.claimedByUserId) {
      await this.prisma.choreInstance.update({ where: { id: instanceId }, data: { claimedByUserId: userId } });
      inst.claimedByUserId = userId;
    }
    if (!this.canAct(inst.chore, inst, userId)) throw new ForbiddenException('Not your chore');

    const updated = await this.prisma.choreInstance.update({
      where: { id: instanceId },
      data: { status: 'SKIPPED', completedAt: new Date(), claimedByUserId: inst.claimedByUserId ?? userId },
    });

    const tz = inst.chore.location?.timezone || DEFAULT_TIMEZONE;
    const due = nextDue(inst.chore.recurrenceRule, inst.dueDate, resolveDaysOfWeek(inst.chore), inst.chore.dueTime, tz);
    if (due) await this.createNextInstance(inst.choreId, due);
    this.displayEvents.publish(familyId, { type: 'chores' });
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
    // The chore still completes/approves/streaks normally either way — this
    // only gates whether either ledger entry below actually gets written.
    const recipientTokensDisabled = recipient
      ? !!(await this.prisma.user.findUnique({ where: { id: recipient }, select: { tokensDisabled: true } }))?.tokensDisabled
      : false;
    const completedAt = inst.completedAt ?? new Date();
    const daysLate = Math.max(0, Math.floor((completedAt.getTime() - inst.dueDate.getTime()) / 86_400_000));
    if (recipient && !recipientTokensDisabled && inst.chore.tokenValue > 0) {
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
        if (!recipientTokensDisabled && inst.chore.streakGoal && inst.chore.streakBonusTokens > 0 && currentStreak % inst.chore.streakGoal === 0) {
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

    const due = nextDue(
      inst.chore.recurrenceRule,
      inst.dueDate,
      resolveDaysOfWeek(inst.chore),
      inst.chore.dueTime,
      inst.chore.location?.timezone || DEFAULT_TIMEZONE,
    );
    if (due) await this.createNextInstance(inst.chore.id, due);
    this.displayEvents.publish(inst.chore.familyId, { type: 'chores' });
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
    this.displayEvents.publish(familyId, { type: 'chores' });
    return updated;
  }

  // Adult re-enables a chore to be done again now (even a periodic one already done),
  // by creating a fresh open occurrence due today.
  async reopen(familyId: string, actorId: string, choreId: string) {
    await this.assertAdult(actorId);
    const chore = await this.ownedChore(familyId, choreId);
    const tz = await this.resolveTimezone(chore.locationId);
    const due = dueInstant(todayKeyInZone(tz), chore.dueTime, tz);
    // Re-use an already-open instance instead of stacking a second one on top of
    // it — clicking "Enable again" more than once shouldn't leave two open
    // occurrences (e.g. this week's normal cycle and a manual one) alive at once.
    const existing = await this.prisma.choreInstance.findFirst({ where: { choreId, status: 'OPEN' } });
    if (existing) {
      const updated = await this.prisma.choreInstance.update({ where: { id: existing.id }, data: { dueDate: due } });
      this.displayEvents.publish(familyId, { type: 'chores' });
      return updated;
    }
    await this.createNextInstance(choreId, due);
    this.displayEvents.publish(familyId, { type: 'chores' });
    return this.prisma.choreInstance.findFirst({ where: { choreId, dueDate: due } });
  }

  async balances(familyId: string) {
    const grouped = await this.prisma.tokenLedger.groupBy({
      by: ['userId'],
      _sum: { delta: true },
      where: { user: { familyId } },
    });
    return grouped.map((g) => ({ userId: g.userId, balance: g._sum.delta ?? 0 }));
  }

  // Still-actionable chores due on a given calendar day, for the kiosk's idle
  // screensaver "at a glance" list — no signed-in profile needed, so this
  // can't reuse list()'s per-user scoping. Same location rule as the rest of
  // the app: unscoped (locationId null, the kiosk isn't tied to a household)
  // sees everything; scoped sees location-less chores plus that one
  // location's. `excludePassed` drops OPEN instances whose due instant has
  // already gone by (dueDate already IS the precise due instant — end-of-day
  // if the chore has no dueTime, else that exact wall-clock time — so a plain
  // `dueDate >= now` comparison is all that's needed); PENDING instances
  // (awaiting approval) are never excluded by this since they're not
  // "upcoming," they already happened.
  async dueOnDay(
    familyId: string,
    locationId: string | null | undefined,
    key: DateKey,
    tz: string,
    opts: { excludePassed?: boolean } = {},
  ) {
    const startOfDay = startOfDayInZone(key, tz);
    const endOfDay = endOfDayInZone(key, tz);
    const instances = await this.prisma.choreInstance.findMany({
      where: {
        status: { in: ['OPEN', 'PENDING'] },
        dueDate: { gte: startOfDay, lte: endOfDay },
        chore: {
          familyId,
          ...(locationId ? { OR: [{ locationId: null }, { locationId }] } : {}),
        },
      },
      include: { chore: { include: { assignees: { include: { user: { select: { displayName: true } } } } } } },
      orderBy: { dueDate: 'asc' },
    });
    const now = new Date();
    const filtered = opts.excludePassed ? instances.filter((i) => i.status === 'PENDING' || i.dueDate >= now) : instances;
    return filtered.map((i) => ({
      id: i.id,
      title: i.chore.title,
      dueTime: i.chore.dueTime,
      status: i.status,
      assignedTo:
        i.chore.assignmentType === 'ANYONE' ? 'Anyone' : i.chore.assignees.map((a) => a.user.displayName).join(', '),
    }));
  }

  // "Today" has to mean the location's (or family default) wall-clock day —
  // the server process runs UTC (Docker), so a naive `new Date()` +
  // setHours(0,0,0,0) computes UTC midnight, which for a Mountain-time
  // family is already mid-evening the day before or after depending on the
  // hour. Same class of bug the due-date math elsewhere in this file was
  // already fixed for (see dueInstant/todayKeyInZone).
  async dueToday(familyId: string, locationId?: string | null) {
    const tz = await this.resolveTimezone(locationId);
    return this.dueOnDay(familyId, locationId, todayKeyInZone(tz), tz, { excludePassed: true });
  }
}
