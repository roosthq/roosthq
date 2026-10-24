// Applies a reviewed question-bank change set to the live database WITHOUT
// ever deleting a question or touching a kid's progress (the seed script
// replaces whole grades and refuses once anyone has played one; this is the
// safe incremental path - see seed-edu-questions.js for why that matters).
//
// Bundle layout (--bundle <dir>, default prisma/seed-data/edu-sync):
//   dedupe.json            ids to deactivate (duplicates across grades)
//   patches/<SUBJ>-<G>.json [{id, action: 'fix'|'deactivate', prompt?, choicesJson?, answer?, acceptedAnswers?, reason}]
//   new/<SUBJ>-<G>.json     [{type, prompt, choicesJson?, answer, acceptedAnswers?, tags?, media?}]
//
// Idempotent: re-running changes nothing that's already applied. Dry run by
// default; pass --apply to write. Run from server/:
//   node prisma/tools/edu-sync.js [--bundle dir] [--apply]

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { validateRow, norm, normPrompt } = require('./edu-validate');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const bi = args.indexOf('--bundle');
const BUNDLE = bi >= 0 ? path.resolve(args[bi + 1]) : path.join(__dirname, '..', 'seed-data', 'edu-sync');

// Two questions are the same only if prompt AND answer AND attached media match -
// "What comes next in the pattern?" / B is a different question for every picture.
// MySQL's JSON column re-orders object keys, so media is compared canonically.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const dupKey = (prompt, answer, media) => `${normPrompt(prompt)}|${norm(answer)}|${media && typeof media === 'object' ? JSON.stringify(canon(media)) : ''}`;
const arrOrNull = (a) => (Array.isArray(a) && a.length ? JSON.stringify(a) : 'null');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const listJson = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')) : []);

async function main() {
  const stats = { deactivated: 0, fixed: 0, fixSkipped: 0, inserted: 0, dupSkipped: 0, invalidSkipped: 0 };

  // 1. duplicate ids
  const dedupeFile = path.join(BUNDLE, 'dedupe.json');
  if (fs.existsSync(dedupeFile)) {
    const ids = readJson(dedupeFile);
    const live = await prisma.eduQuestion.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
    stats.deactivated += live.length;
    if (APPLY && live.length) await prisma.eduQuestion.updateMany({ where: { id: { in: live.map((l) => l.id) } }, data: { active: false } });
  }

  // 2. patches
  for (const f of listJson(path.join(BUNDLE, 'patches'))) {
    const patches = readJson(path.join(BUNDLE, 'patches', f));
    for (const p of patches) {
      const row = await prisma.eduQuestion.findUnique({ where: { id: p.id } });
      if (!row) {
        stats.fixSkipped++;
        continue;
      }
      if (p.action === 'deactivate') {
        if (row.active) {
          stats.deactivated++;
          if (APPLY) await prisma.eduQuestion.update({ where: { id: row.id }, data: { active: false } });
        }
        continue;
      }
      const merged = {
        type: row.type,
        prompt: p.prompt ?? row.prompt,
        choicesJson: p.choicesJson ?? row.choicesJson,
        answer: p.answer ?? row.answer,
        acceptedAnswers: p.acceptedAnswers ?? row.acceptedJson ?? undefined,
        media: row.mediaJson ?? undefined,
      };
      const errs = validateRow(merged, {}).filter(([l]) => l === 'ERROR');
      if (errs.length) {
        console.warn(`skip fix ${row.id}: ${errs.map((e) => e[1]).join('; ')}`);
        stats.fixSkipped++;
        continue;
      }
      const same =
        merged.prompt === row.prompt &&
        merged.answer === row.answer &&
        JSON.stringify(merged.choicesJson ?? null) === JSON.stringify(row.choicesJson ?? null) &&
        arrOrNull(merged.acceptedAnswers) === arrOrNull(row.acceptedJson);
      if (same) continue;
      stats.fixed++;
      if (APPLY) {
        await prisma.eduQuestion.update({
          where: { id: row.id },
          data: {
            prompt: merged.prompt,
            answer: merged.answer,
            choicesJson: merged.choicesJson ?? undefined,
            acceptedJson: merged.acceptedAnswers && merged.acceptedAnswers.length ? merged.acceptedAnswers : undefined,
          },
        });
      }
    }
  }

  // 3. new questions - never duplicate anything active in the same subject
  const seenBySubject = new Map();
  const seen = async (subject) => {
    if (!seenBySubject.has(subject)) {
      const rows = await prisma.eduQuestion.findMany({ where: { subject, active: true }, select: { prompt: true, answer: true, mediaJson: true } });
      seenBySubject.set(subject, new Set(rows.map((r) => dupKey(r.prompt, r.answer, r.mediaJson))));
    }
    return seenBySubject.get(subject);
  };
  for (const f of listJson(path.join(BUNDLE, 'new'))) {
    const m = f.match(/^([A-Z]+)-(\d+)/);
    if (!m) continue;
    const subject = m[1];
    const grade = Number(m[2]);
    const rows = readJson(path.join(BUNDLE, 'new', f));
    const keys = await seen(subject);
    const toInsert = [];
    for (const r of rows) {
      const errs = validateRow(r, {}).filter(([l]) => l === 'ERROR');
      if (errs.length) {
        stats.invalidSkipped++;
        continue;
      }
      const key = dupKey(r.prompt, r.answer, r.media);
      if (keys.has(key)) {
        stats.dupSkipped++;
        continue;
      }
      keys.add(key);
      toInsert.push({
        subject,
        grade,
        type: r.type,
        prompt: r.prompt,
        choicesJson: r.type === 'TEXT_INPUT' ? null : r.choicesJson ?? null,
        answer: r.answer,
        tags: r.tags ?? [],
        mediaJson: r.media ?? null,
        acceptedJson: r.acceptedAnswers && r.acceptedAnswers.length ? r.acceptedAnswers : null,
      });
    }
    stats.inserted += toInsert.length;
    if (APPLY && toInsert.length) await prisma.eduQuestion.createMany({ data: toInsert });
  }

  console.log(APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)', stats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
