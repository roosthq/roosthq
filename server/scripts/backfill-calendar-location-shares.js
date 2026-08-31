// One-time backfill for PLANNING.md §16 (calendar sharing by location).
//
// Before this ships, calendar visibility per location was INFERRED from
// wherever the calendar's sharer(s) personally live. This script converts
// that inferred state into explicit CalendarLocationShare rows so nothing
// visually changes for anyone the moment the new code goes live - the new
// explicit rule then takes over from an identical starting point.
//
// Safe to run more than once: skips any calendar that already has explicit
// CalendarLocationShare rows (assumes those were deliberately set, either by
// an earlier run of this script or by an adult using the new UI).
//
// Run once, after `prisma db push` has created the new table, before (or
// right after) deploying the code that reads it:
//   docker compose exec server node scripts/backfill-calendar-location-shares.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const calendars = await prisma.calendar.findMany({
    include: { shares: { include: { user: { include: { locations: true } } } } },
  });

  let calendarsTouched = 0;
  let rowsInserted = 0;

  for (const cal of calendars) {
    if (cal.shares.length === 0) continue; // not really shared into the family at all

    const locations = await prisma.location.findMany({ where: { familyId: cal.familyId }, select: { id: true } });
    // A family with 0 or 1 locations has no location distinction to infer in
    // the first place - every calendar was already effectively "whole
    // family" visibility, exactly what an empty share set already means.
    if (locations.length <= 1) continue;
    const allLocationIds = new Set(locations.map((l) => l.id));

    // Old inference: visible at location X if ANY sharer lives at X, or ANY
    // sharer has no location at all (that unconditionally made it visible
    // everywhere, short-circuiting the rest).
    let wholeFamily = false;
    const visibleLocs = new Set();
    for (const s of cal.shares) {
      const sharerLocs = s.user.locations.map((l) => l.locationId);
      if (sharerLocs.length === 0) {
        wholeFamily = true;
        break;
      }
      sharerLocs.forEach((id) => visibleLocs.add(id));
    }
    // Either genuinely whole-family, or happens to already cover every
    // location - both are exactly what an EMPTY CalendarLocationShare set
    // already means going forward, so there's nothing to insert.
    if (wholeFamily || visibleLocs.size >= allLocationIds.size) continue;

    const existing = await prisma.calendarLocationShare.count({ where: { calendarId: cal.id } });
    if (existing > 0) continue; // already explicit - don't stomp a deliberate choice

    for (const locationId of visibleLocs) {
      await prisma.calendarLocationShare.create({ data: { calendarId: cal.id, locationId } });
      rowsInserted++;
    }
    calendarsTouched++;
    console.log(`"${cal.name}" (${cal.id}): backfilled visible-at [${[...visibleLocs].join(', ')}]`);
  }

  console.log(`Done. ${calendarsTouched} calendar(s) backfilled, ${rowsInserted} CalendarLocationShare row(s) inserted.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
