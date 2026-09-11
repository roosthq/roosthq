// Loads server/prisma/seed-data/edu-questions/<SUBJECT>-<GRADE>.json into the
// EduQuestion table (PLANNING.md §19). Plain Node + @prisma/client, no
// ts-node - this repo has no seed-script tooling yet and one script doesn't
// justify adding a new dev dependency.
//
// Idempotent by REPLACEMENT, not upsert-by-content: each run deletes every
// row for that (subject, grade) and reinserts the file's current contents.
// Fine before real EduSession history exists against these ids (true for
// this first seed); once kids have real sessions referencing specific
// question ids, switch this to upsert-by-content-hash so a re-seed doesn't
// orphan `roundsJson` question-id references mid-flight.
//
// Run from server/: node prisma/seed-edu-questions.js
// (needs `npx prisma generate` run first if the client was regenerated since
// EduQuestion was added to schema.prisma)

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DIR = path.join(__dirname, 'seed-data', 'edu-questions');

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.log('No seed files found in', DIR);
    return;
  }
  let totalInserted = 0;
  for (const file of files) {
    const m = file.match(/^([A-Z]+)-(\d+)\.json$/);
    if (!m) {
      console.warn(`Skipping ${file} - expected <SUBJECT>-<GRADE>.json`);
      continue;
    }
    const subject = m[1];
    const grade = parseInt(m[2], 10);
    const rows = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    if (!Array.isArray(rows) || !rows.length) {
      console.warn(`Skipping ${file} - empty or not an array`);
      continue;
    }

    const { count: deleted } = await prisma.eduQuestion.deleteMany({ where: { subject, grade } });
    await prisma.eduQuestion.createMany({
      data: rows.map((r) => ({
        subject,
        grade,
        type: r.type,
        prompt: r.prompt,
        choicesJson: r.choicesJson ?? null,
        answer: r.answer,
        tags: r.tags ?? [],
      })),
    });
    totalInserted += rows.length;
    console.log(`${subject} grade ${grade}: replaced ${deleted} -> ${rows.length} questions`);
  }
  console.log(`Done. ${totalInserted} questions across ${files.length} file(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
