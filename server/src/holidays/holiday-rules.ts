// Pure date math for projecting a HolidayEvent rule into concrete dates for
// a given year - kept separate from HolidaysService so it's trivially unit
// testable and has zero Prisma/Nest dependencies.

export interface HolidayRule {
  id: string;
  title: string;
  ruleType: string;
  month: number | null;
  day: number | null;
  weekday: number | null;
  ordinal: number | null;
  offsetDays: number | null;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher) - the standard
// closed-form calculation for the Sunday of Western Easter, valid for any
// Gregorian year. Returns a UTC midnight Date for that year's Easter Sunday.
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// The nth (or last, ordinal -1) occurrence of `weekday` in `month` of `year`.
// month is 1-12, weekday is 0 (Sun) - 6 (Sat), ordinal is 1-4 or -1.
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): Date {
  if (ordinal === -1) {
    // Walk back from the last day of the month to the last matching weekday.
    const lastOfMonth = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this one
    const diff = (lastOfMonth.getUTCDay() - weekday + 7) % 7;
    lastOfMonth.setUTCDate(lastOfMonth.getUTCDate() - diff);
    return lastOfMonth;
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const diff = (weekday - first.getUTCDay() + 7) % 7;
  first.setUTCDate(1 + diff + (ordinal - 1) * 7);
  return first;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// This rule's date in `year`, or null if the rule is malformed (missing a
// field its ruleType needs) - malformed rows are skipped rather than
// thrown on, so one bad row never blanks the whole calendar for everyone.
function occurrenceInYear(rule: HolidayRule, year: number): Date | null {
  switch (rule.ruleType) {
    case 'FIXED':
      if (rule.month == null || rule.day == null) return null;
      return new Date(Date.UTC(year, rule.month - 1, rule.day));
    case 'NTH_WEEKDAY':
      if (rule.month == null || rule.weekday == null || rule.ordinal == null) return null;
      return nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.ordinal);
    case 'EASTER_OFFSET': {
      const easter = easterSunday(year);
      easter.setUTCDate(easter.getUTCDate() + (rule.offsetDays ?? 0));
      return easter;
    }
    default:
      return null;
  }
}

// The soonest occurrence on or after `from` - this year's date if it hasn't
// passed yet, otherwise next year's. Used for both "next occurrence" display
// and sorting the holiday list by upcoming date (rather than by raw
// month/day, which doesn't exist for NTH_WEEKDAY/EASTER_OFFSET rows and
// wouldn't reflect ordinal/Easter shifts anyway).
export function nextOccurrence(rule: HolidayRule, from: Date): Date | null {
  const year = from.getUTCFullYear();
  const thisYear = occurrenceInYear(rule, year);
  if (thisYear && thisYear >= from) return thisYear;
  return occurrenceInYear(rule, year + 1);
}

// All-day, CalEvent-shaped occurrences of every rule that land within
// [start, end) - spans however many calendar years the range crosses (a
// range straddling New Year's needs both years checked).
export function projectOccurrences(rules: HolidayRule[], start: Date, end: Date) {
  const out: Array<{
    id: string;
    uid: string;
    calendarId: string;
    title: string;
    start: { date: string };
    end: { date: string };
  }> = [];
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  for (const rule of rules) {
    for (let year = startYear; year <= endYear; year++) {
      const date = occurrenceInYear(rule, year);
      if (!date || date < start || date >= end) continue;
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      out.push({
        id: `${rule.id}:${year}`,
        uid: `holiday:${rule.id}:${year}`,
        calendarId: 'holidays',
        title: rule.title,
        start: { date: isoDate(date) },
        end: { date: isoDate(next) },
      });
    }
  }
  return out;
}
