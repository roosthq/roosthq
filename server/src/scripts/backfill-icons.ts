// One-time maintenance script (2026-08-14 icon-overhaul session): fixes real
// rows written before this migration that still hold the OLD literal-emoji
// value LucideIcon/AwardIcon now can't render (see the comments on
// Family.tokenIcon / Countdown.emoji in schema.prisma, and awardPacks.ts) -
// those rows currently render nothing where their icon should be.
//
// Safe to run more than once (idempotent - only touches rows still holding
// one of the known-bad exact values). Run against the real deployment with:
//   docker compose exec server node dist/scripts/backfill-icons.js
//
// Not wired into app startup or any controller on purpose - this is a fix
// for pre-migration data, not an ongoing thing the app needs to do.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Old literal emoji -> the Lucide name (lucideData.ts) it was always meant
// to represent. Includes the tokenIcon/Countdown.emoji defaults plus every
// icon awardPacks.ts used to write before this session's fix.
const EMOJI_TO_LUCIDE: Record<string, string> = {
  '🪙': 'coins',
  '🎉': 'party-popper',
  '🎂': 'cake',
  '🏠': 'home',
  '🧹': 'broom',
  '🛏️': 'bed',
  '🍽️': 'utensils-crossed',
  '🐾': 'paw-print',
  '📚': 'book-open',
  '🧠': 'graduation-cap',
  '🌅': 'sunrise',
  '🎯': 'target',
  '🦸': 'heart-handshake',
  '🌟': 'star',
  '🤝': 'handshake',
  '🏅': 'medal',
  '🔥': 'flame',
  '📆': 'calendar-days',
  '⭐': 'star',
  '😊': 'smile',
  '🌱': 'sprout',
  '💪': 'dumbbell',
  '🧩': 'puzzle',
};

async function main() {
  let fixedFamilies = 0;
  let fixedCountdowns = 0;
  let fixedAwards = 0;

  for (const [badEmoji, goodName] of Object.entries(EMOJI_TO_LUCIDE)) {
    const fam = await prisma.family.updateMany({ where: { tokenIcon: badEmoji }, data: { tokenIcon: goodName } });
    fixedFamilies += fam.count;

    const cd = await prisma.countdown.updateMany({ where: { emoji: badEmoji }, data: { emoji: goodName } });
    fixedCountdowns += cd.count;

    const aw = await prisma.award.updateMany({ where: { icon: badEmoji }, data: { icon: goodName } });
    fixedAwards += aw.count;
  }

  console.log(`Backfilled: ${fixedFamilies} Family.tokenIcon, ${fixedCountdowns} Countdown.emoji, ${fixedAwards} Award.icon row(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
