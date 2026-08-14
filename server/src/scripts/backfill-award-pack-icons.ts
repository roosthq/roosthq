// One-time maintenance script (2026-08-14): fixes real Award rows spawned
// from AWARD_PACKS (web/src/awardPacks.ts) before that file's per-award icons
// were corrected - the pack's award entries used to all share ONE emoji
// (medal-ish), so every award "Add"ed from a pack got the SAME icon
// (backfill-icons.ts's emoji->Lucide mapping then correctly, but
// deterministically, mapped that one shared bad value to 'medal' for
// everything - it wasn't a bug in that script, the source data really was
// uniform at the time these rows were created).
//
// Matches by exact award name (pack names are specific enough - "Tidy
// Streak", "Bed-Making Pro" - that a real family's own custom award sharing
// one is vanishingly unlikely) AND current icon === 'medal', so this only
// ever touches rows still holding the exact collapsed value; anything a
// family already re-picked in the Icons picker is left alone.
//
// Safe to run more than once (idempotent - the icon:'medal' guard stops
// matching once a row's fixed). Run against the real deployment with:
//   docker compose exec server node dist/scripts/backfill-award-pack-icons.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mirrors AWARD_PACKS in web/src/awardPacks.ts - keep these two in sync if
// that file's icons ever change. Award names double as the match key.
const PACK_AWARD_ICONS: Record<string, string> = {
  'Tidy Streak': 'broom',
  'Bed-Making Pro': 'bed',
  'Kitchen Helper': 'utensils-crossed',
  'Pet Care Star': 'paw-print',
  Bookworm: 'book-open',
  'Homework Hero': 'graduation-cap',
  'Early Bird': 'sunrise',
  'Goal Getter': 'target',
  'Kindness Award': 'heart-handshake',
  'Helper of the Month': 'star',
  'Team Player': 'handshake',
  'Good Sport': 'medal',
  'First Week Complete': 'party-popper',
  'Zero Missed Days': 'flame',
  '30-Day Streak': 'calendar-days',
  'Leveled Up': 'star',
  'Great Attitude': 'smile',
  'Tried Something New': 'sprout',
  'Extra Effort': 'dumbbell',
  'Problem Solver': 'puzzle',
};

async function main() {
  let fixed = 0;
  for (const [name, icon] of Object.entries(PACK_AWARD_ICONS)) {
    // Skip the one pack award whose correct icon genuinely IS 'medal'
    // ("Good Sport") - nothing to fix there, and the guard below would
    // otherwise no-op on it anyway since icon already equals icon.
    if (icon === 'medal') continue;
    const r = await prisma.award.updateMany({ where: { name, icon: 'medal' }, data: { icon } });
    fixed += r.count;
  }
  console.log(`Backfilled ${fixed} award-pack icon row(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
