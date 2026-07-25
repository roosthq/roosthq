import type { CalEvent, Chore, ChoreInstance } from './api';

export const PERSON_COLORS = ['#0ea5e9', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#6366f1', '#eab308', '#ef4444'];

// A chore occurrence plotted onto the calendar. `instance` is a real DB row
// (actionable — claim/complete/approve all work) only for the most recent
// known occurrence per chore; anything projected further out is virtual
// (informational only — there's no row to act on yet, and the server
// wouldn't let you complete a future-dated one anyway).
export interface ChoreOccurrence {
  chore: Chore;
  dueDate: Date;
  instance: ChoreInstance | null;
  assigneeUserId: string;
}

function resolveDaysOfWeek(chore: { daysOfWeek?: number[] | null; dayOfWeek?: number | null }): number[] {
  if (chore.daysOfWeek?.length) return chore.daysOfWeek;
  return chore.dayOfWeek != null ? [chore.dayOfWeek] : [];
}

// Client-side mirror of the server's nextDue() (see chores.service.ts) — same
// math ChoresPanel's "Next: ..." label already uses, generalized into a loop.
// Returns the SAME instant when the chore doesn't recur, so callers can
// detect "nothing further to project" and stop.
function stepOccurrence(rule: string | undefined, from: Date, daysOfWeek: number[]): Date {
  const d = new Date(from);
  if (daysOfWeek.length > 1) {
    const fromDow = d.getDay();
    let best = 7;
    for (const dow of daysOfWeek) {
      let offset = (dow - fromDow + 7) % 7;
      if (offset === 0) offset = 7;
      if (offset < best) best = offset;
    }
    d.setDate(d.getDate() + (best === 7 ? 0 : best));
    return d;
  }
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
      return d;
  }
}

const MAX_PROJECTED_STEPS = 60;

// Project every occurrence (real + virtual) of the given people's chores
// that falls within [rangeStart, rangeEnd]. SPECIFIC chores project forward
// from their latest known instance; ANYONE chores only ever show their real
// current instance (if claimed by one of `personIds`) — there's no assignee
// to attribute an unclaimed future occurrence to.
export function projectChoreOccurrences(
  chores: Chore[],
  personIds: Set<string>,
  rangeStart: Date,
  rangeEnd: Date,
): ChoreOccurrence[] {
  const out: ChoreOccurrence[] = [];
  if (!personIds.size) return out;

  for (const chore of chores) {
    const assigneeIds =
      chore.assignmentType === 'SPECIFIC'
        ? chore.assignees.map((a) => a.userId).filter((id) => personIds.has(id))
        : [];
    if (chore.assignmentType === 'SPECIFIC' && !assigneeIds.length) continue;

    const sorted = [...chore.instances].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    for (const inst of sorted) {
      const d = new Date(inst.dueDate);
      if (d < rangeStart || d > rangeEnd) continue;
      if (chore.assignmentType === 'ANYONE') {
        if (inst.claimedByUserId && personIds.has(inst.claimedByUserId)) {
          out.push({ chore, dueDate: d, instance: inst, assigneeUserId: inst.claimedByUserId });
        }
      } else {
        for (const uid of assigneeIds) out.push({ chore, dueDate: d, instance: inst, assigneeUserId: uid });
      }
    }

    if (chore.assignmentType !== 'SPECIFIC' || !assigneeIds.length) continue;
    const latest = sorted[sorted.length - 1];
    if (!latest) continue;
    const daysOfWeek = resolveDaysOfWeek(chore);
    let cursor = new Date(latest.dueDate);
    for (let i = 0; i < MAX_PROJECTED_STEPS; i++) {
      const next = stepOccurrence(chore.recurrenceRule, cursor, daysOfWeek);
      if (next.getTime() === cursor.getTime()) break; // one-time chore — nothing further
      cursor = next;
      if (cursor > rangeEnd) break;
      if (cursor >= rangeStart) {
        for (const uid of assigneeIds) out.push({ chore, dueDate: new Date(cursor), instance: null, assigneeUserId: uid });
      }
    }
  }
  return out;
}

// A single point-in-time pseudo-event for the calendar grid/day-modal — same
// flat shape a Google/local calendar event uses, so Calendar.tsx renders it
// unmodified. `renderExtra` (a Calendar.tsx prop) is how the caller bolts on
// chore-specific action buttons for the real (non-virtual) occurrence.
export function choreOccurrenceEvent(occ: ChoreOccurrence, color: string, personName: string): CalEvent {
  const dueTime = occ.chore.dueTime;
  const dateStr = occ.dueDate.toISOString().slice(0, 10);
  return {
    id: `chore-${occ.chore.id}-${occ.assigneeUserId}-${occ.dueDate.getTime()}`,
    uid: `chore-${occ.chore.id}-${occ.assigneeUserId}-${occ.dueDate.getTime()}`,
    calendarId: `chore-person-${occ.assigneeUserId}`,
    calendarColor: color,
    calendarName: `${personName}'s chores`,
    title: `🧹 ${occ.chore.title}`,
    start: dueTime ? { dateTime: occ.dueDate.toISOString() } : { date: dateStr },
    end: dueTime ? { dateTime: occ.dueDate.toISOString() } : { date: dateStr },
  };
}
