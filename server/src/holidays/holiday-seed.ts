// Default holiday set — US federal + common cultural — seeded once when the
// HolidayEvent table is empty (see HolidaysService.ensureSeeded). Not a
// migration: the instance owner can freely edit/delete/add to this list
// afterward from Settings; this only fires if nobody's touched it yet.
export const HOLIDAY_SEED: Array<{
  title: string;
  ruleType: 'FIXED' | 'NTH_WEEKDAY' | 'EASTER_OFFSET';
  month?: number;
  day?: number;
  weekday?: number;
  ordinal?: number;
  offsetDays?: number;
}> = [
  // US federal
  { title: "New Year's Day", ruleType: 'FIXED', month: 1, day: 1 },
  { title: 'Martin Luther King Jr. Day', ruleType: 'NTH_WEEKDAY', month: 1, weekday: 1, ordinal: 3 },
  { title: "Presidents' Day", ruleType: 'NTH_WEEKDAY', month: 2, weekday: 1, ordinal: 3 },
  { title: 'Memorial Day', ruleType: 'NTH_WEEKDAY', month: 5, weekday: 1, ordinal: -1 },
  { title: 'Juneteenth', ruleType: 'FIXED', month: 6, day: 19 },
  { title: 'Independence Day', ruleType: 'FIXED', month: 7, day: 4 },
  { title: 'Labor Day', ruleType: 'NTH_WEEKDAY', month: 9, weekday: 1, ordinal: 1 },
  { title: 'Columbus Day', ruleType: 'NTH_WEEKDAY', month: 10, weekday: 1, ordinal: 2 },
  { title: 'Veterans Day', ruleType: 'FIXED', month: 11, day: 11 },
  { title: 'Thanksgiving', ruleType: 'NTH_WEEKDAY', month: 11, weekday: 4, ordinal: 4 },
  { title: 'Christmas Day', ruleType: 'FIXED', month: 12, day: 25 },
  // Common cultural
  { title: "Valentine's Day", ruleType: 'FIXED', month: 2, day: 14 },
  { title: "Mother's Day", ruleType: 'NTH_WEEKDAY', month: 5, weekday: 0, ordinal: 2 },
  { title: "Father's Day", ruleType: 'NTH_WEEKDAY', month: 6, weekday: 0, ordinal: 3 },
  { title: 'Halloween', ruleType: 'FIXED', month: 10, day: 31 },
  { title: "New Year's Eve", ruleType: 'FIXED', month: 12, day: 31 },
  { title: 'Good Friday', ruleType: 'EASTER_OFFSET', offsetDays: -2 },
  { title: 'Easter Sunday', ruleType: 'EASTER_OFFSET', offsetDays: 0 },
];
