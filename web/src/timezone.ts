// Client-side mirror of server/src/common/timezone.ts's zone math - a chore
// due "today" has to mean today in the CHORE'S OWN location's timezone, not
// whatever timezone the viewing device's clock happens to be set to. A kiosk
// (or phone) with a system clock in a different zone than the household it's
// showing was making still-due-today chores silently vanish (and, worse,
// their absence never surfaced as an error - a chore just looked done or not
// due, with no sign anything was wrong).
export interface DateKey {
  y: number;
  m: number; // 1-12
  d: number;
}

export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, ms: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const asTz = new Date(guess.toLocaleString('en-US', { timeZone })).getTime();
  return new Date(guess.getTime() + (asUtc - asTz));
}

export function dateKeyInZone(date: Date, timeZone: string): DateKey {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

export function todayKeyInZone(timeZone: string): DateKey {
  return dateKeyInZone(new Date(), timeZone);
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  const d = new Date(Date.UTC(key.y, key.m - 1, key.d));
  d.setUTCDate(d.getUTCDate() + days);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function endOfDayInZone(key: DateKey, timeZone: string): Date {
  return zonedTimeToUtc(key.y, key.m, key.d, 23, 59, 59, 999, timeZone);
}

export function startOfDayInZone(key: DateKey, timeZone: string): Date {
  return zonedTimeToUtc(key.y, key.m, key.d, 0, 0, 0, 0, timeZone);
}

// Day of week (0=Sun) for a calendar key - pure calendar math (Date.UTC
// never has DST), exact regardless of which zone the key came from.
export function dowOfKey(key: DateKey): number {
  return new Date(Date.UTC(key.y, key.m - 1, key.d)).getUTCDay();
}
