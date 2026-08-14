// Timezone-aware date math using only Intl (Node's ICU build), no external
// dependency. Every "due date" in this app is meant to be end-of-day
// (23:59:59.999) in the chore's own location's timezone - not the server
// process's ambient one (UTC inside the Docker image), which is what caused
// due times to render as ~5pm the previous day: midnight UTC on a Mountain
// Time family's screen is 5-6pm the day before.

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    return Intl.supportedValuesOf('timeZone').includes(tz);
  } catch {
    return false;
  }
}

export const DEFAULT_TIMEZONE = isValidTimeZone(process.env.DEFAULT_TIMEZONE) ? process.env.DEFAULT_TIMEZONE : 'UTC';

export interface DateKey {
  y: number;
  m: number; // 1-12
  d: number;
}

// The UTC instant for a given wall-clock time in `timeZone`, resolving DST
// correctly for that specific date. Classic double-round-trip trick: format
// the same instant in both UTC and the target zone, and the (server-local
// parsing) bias introduced by round-tripping through Date cancels out in the
// subtraction, leaving just the real UTC/zone offset.
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, ms: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const asTz = new Date(guess.toLocaleString('en-US', { timeZone })).getTime();
  return new Date(guess.getTime() + (asUtc - asTz));
}

export function endOfDayInZone(key: DateKey, timeZone: string): Date {
  return zonedTimeToUtc(key.y, key.m, key.d, 23, 59, 59, 999, timeZone);
}

export function startOfDayInZone(key: DateKey, timeZone: string): Date {
  return zonedTimeToUtc(key.y, key.m, key.d, 0, 0, 0, 0, timeZone);
}

// A specific "HH:mm" wall-clock time on a calendar day, in `timeZone`.
export function timeInZone(key: DateKey, hh: number, mm: number, timeZone: string): Date {
  return zonedTimeToUtc(key.y, key.m, key.d, hh, mm, 0, 0, timeZone);
}

// Parses "HH:mm" (validating range) - returns null for anything else so
// callers can cleanly fall back to end-of-day.
export function parseHHmm(s: string | null | undefined): { hh: number; mm: number } | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

// The due instant for a calendar day: dueTime's wall-clock time if it parses,
// otherwise end-of-day - the fallback every chore used before dueTime existed.
export function dueInstant(key: DateKey, dueTime: string | null | undefined, timeZone: string): Date {
  const parsed = parseHHmm(dueTime);
  return parsed ? timeInZone(key, parsed.hh, parsed.mm, timeZone) : endOfDayInZone(key, timeZone);
}

// Which calendar day (in `timeZone`) a UTC instant falls on.
export function dateKeyInZone(date: Date, timeZone: string): DateKey {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

export function todayKeyInZone(timeZone: string): DateKey {
  return dateKeyInZone(new Date(), timeZone);
}

// Day of week (0=Sun) for a calendar key - pure calendar math (Date.UTC never
// has DST), so this is exact regardless of which zone the key came from.
export function dowOfKey(key: DateKey): number {
  return new Date(Date.UTC(key.y, key.m - 1, key.d)).getUTCDay();
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  const d = new Date(Date.UTC(key.y, key.m - 1, key.d));
  d.setUTCDate(d.getUTCDate() + days);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function addMonthsToKey(key: DateKey, months: number): DateKey {
  const d = new Date(Date.UTC(key.y, key.m - 1, key.d));
  d.setUTCMonth(d.getUTCMonth() + months);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// This week's Monday-through-next-Monday range, in `timeZone`'s own wall
// clock - the default calendar-events window when a caller doesn't supply an
// explicit one. Same bug class as dueInstant/todayKeyInZone above: a naive
// `new Date()` + `setHours(0,0,0,0)` computes the server process's own
// midnight (UTC inside Docker), which lands on the wrong day for roughly the
// 7-hour window each day where UTC has already flipped but Mountain Time
// hasn't (worse right at a week boundary - up to 7 hours of "this week"
// actually meaning last week's Monday, or vice versa).
export function weekRangeInZone(timeZone: string): { start: string; end: string } {
  const today = todayKeyInZone(timeZone);
  const monday = addDaysToKey(today, -((dowOfKey(today) + 6) % 7));
  const nextMonday = addDaysToKey(monday, 7);
  return { start: startOfDayInZone(monday, timeZone).toISOString(), end: startOfDayInZone(nextMonday, timeZone).toISOString() };
}
