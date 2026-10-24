// Merge the visual-set agents' output into the sync bundle.
const fs = require('fs');
const S = 'C:/Users/sheac/AppData/Local/Temp/claude/C--Users-sheac-Github-Personal/d3295f37-d84f-43de-aa58-cf3e2dc83375/scratchpad';
const REPO = 'C:/Users/sheac/Github Personal/Family Calendar System';
const { validateRow, norm, normPrompt } = require(REPO + '/server/prisma/tools/edu-validate.js');
const OUT = REPO + '/server/prisma/seed-data/edu-sync/new';
fs.mkdirSync(OUT, { recursive: true });
const dir = S + '/work/sets';
const by = {};
const stat = {};
const seen = new Set();
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !/tmp/i.test(x)) : []) {
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  } catch {
    console.log('unreadable', f);
    continue;
  }
  const id = f.replace('.json', '');
  stat[id] = { in: arr.length, kept: 0, invalid: 0, dup: 0 };
  for (const it of arr) {
    const { subject, grade, row } = it;
    if (!subject || grade == null || !row) {
      stat[id].invalid++;
      continue;
    }
    const errs = validateRow(row, { mediaRoot: REPO + '/web/public' }).filter(([l]) => l === 'ERROR');
    if (errs.length) {
      stat[id].invalid++;
      console.log('invalid', id, row.prompt, errs.map((e) => e[1]).join('; '));
      continue;
    }
    const key = `${subject}|${normPrompt(row.prompt)}|${norm(row.answer)}|${JSON.stringify(row.media || {})}`;
    if (seen.has(key)) {
      stat[id].dup++;
      continue;
    }
    seen.add(key);
    (by[`${subject}-${grade}`] ||= []).push(row);
    stat[id].kept++;
  }
}
for (const old of fs.readdirSync(OUT).filter((x) => x.endsWith('-sets.json'))) fs.unlinkSync(`${OUT}/${old}`);
for (const [k, rows] of Object.entries(by)) fs.writeFileSync(`${OUT}/${k}-sets.json`, JSON.stringify(rows, null, 1));
console.log(JSON.stringify(stat));
console.log('total set questions', Object.values(by).reduce((a, b) => a + b.length, 0));
