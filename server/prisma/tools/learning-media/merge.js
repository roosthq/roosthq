// Merge generated chunks + verifier corrections into the sync bundle.
// node merge.js   (run from anywhere; paths are absolute)
const fs = require('fs');
const path = require('path');
const S = 'C:/Users/sheac/AppData/Local/Temp/claude/C--Users-sheac-Github-Personal/d3295f37-d84f-43de-aa58-cf3e2dc83375/scratchpad';
const REPO = 'C:/Users/sheac/Github Personal/Family Calendar System/server';
const { validateRow, norm, normPrompt } = require(REPO + '/prisma/tools/edu-validate.js');
const BUNDLE = REPO + '/prisma/seed-data/edu-sync';
const cells = JSON.parse(fs.readFileSync(S + '/work/cells.json', 'utf8'));
const SUBJECTS = ['MATH', 'READING', 'SCIENCE', 'SPELLING', 'LOGIC', 'SOCIAL', 'BIOLOGY'];

fs.mkdirSync(BUNDLE + '/new', { recursive: true });
fs.mkdirSync(BUNDLE + '/patches', { recursive: true });

// deterministic RNG so reruns give the same output
let seed = 123456789;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const shuffle = (a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

const words = (s) => new Set(normPrompt(s).split(' ').filter((w) => w.length > 2));
function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

const existingBySubject = {};
for (const s of SUBJECTS) existingBySubject[s] = [];
for (const c of cells) {
  const f = `${S}/work/existing/${c.subject}-${c.grade}.json`;
  for (const q of JSON.parse(fs.readFileSync(f, 'utf8'))) existingBySubject[c.subject].push({ n: normPrompt(q.prompt), a: norm(q.answer), w: words(q.prompt) });
}

const report = [];
const orderedCells = [...cells].sort((a, b) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.grade - b.grade);
for (const c of orderedCells) {
  const key = `${c.subject}-${c.grade}`;
  const pool = existingBySubject[c.subject];
  // copy review patches through untouched
  const pf = `${S}/work/patches/${key}.json`;
  if (fs.existsSync(pf)) fs.copyFileSync(pf, `${BUNDLE}/patches/${key}.json`);
  if (c.need <= 0) continue;

  const rows = [];
  let missing = 0;
  for (let i = 0; i < 8; i++) {
    const f = `${S}/work/raw/${key}-c${i}.json`;
    if (!fs.existsSync(f)) continue;
    try {
      const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
      arr.forEach((q, idx) => rows.push({ ref: `c${i}:${idx}`, q }));
    } catch (e) {
      missing++;
    }
  }
  const vf = `${S}/work/verify/${key}.json`;
  let verified = false;
  let drop = new Set();
  let fix = {};
  if (fs.existsSync(vf)) {
    try {
      const v = JSON.parse(fs.readFileSync(vf, 'utf8'));
      drop = new Set(v.drop || []);
      fix = v.fix || {};
      verified = true;
    } catch (e) {
      /* unverified */
    }
  }
  if (!verified) {
    // never ship a cell whose independent verification did not complete
    const stale = `${BUNDLE}/new/${key}.json`;
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
    report.push({ key, need: c.need, raw: rows.length, dropped: 0, fixed: 0, invalid: 0, dup: 0, kept: 0, verified: false, unreadable: missing, skew: 0, shuffled: 0 });
    continue;
  }
  const out = [];
  const shapes = {};
  const stat = { raw: rows.length, dropped: 0, invalid: 0, dup: 0, fixed: 0 };
  for (const { ref, q } of rows) {
    if (drop.has(ref)) {
      stat.dropped++;
      continue;
    }
    let row = { ...q };
    if (fix[ref]) {
      row = { ...row, ...fix[ref] };
      stat.fixed++;
    }
    delete row.id;
    delete row.grade;
    delete row.subject;
    if (!row.acceptedAnswers || !row.acceptedAnswers.length) delete row.acceptedAnswers;
    const errs = validateRow(row, {}).filter(([l]) => l === 'ERROR');
    if (errs.length) {
      stat.invalid++;
      continue;
    }
    const n = normPrompt(row.prompt);
    const a = norm(row.answer);
    const w = words(row.prompt);
    if (pool.some((p) => (p.n === n && p.a === a) || (p.a === a && jaccard(p.w, w) >= 0.88))) {
      stat.dup++;
      continue;
    }
    // Same word-problem template with only the numbers changed: keep a few,
    // not forty (short drills like "7 + 6" are exempt - repetition is the point).
    if (row.prompt.length >= 45) {
      const shape = normPrompt(row.prompt.replace(/\d+/g, '#'));
      shapes[shape] = (shapes[shape] || 0) + 1;
      if (shapes[shape] > 3) {
        stat.dup++;
        continue;
      }
    }
    pool.push({ n, a, w });
    out.push(row);
  }
  // answer-position skew fix: shuffle MC rows whose choices have no natural order
  const mc = out.filter((r) => r.type === 'MULTIPLE_CHOICE' && Array.isArray(r.choicesJson));
  const pos = {};
  mc.forEach((r) => {
    const i = r.choicesJson.indexOf(r.answer);
    pos[i] = (pos[i] || 0) + 1;
  });
  const skew = Math.max(0, ...Object.values(pos)) / Math.max(1, mc.length);
  let shuffled = 0;
  if (skew > 0.4) {
    for (const r of mc) {
      const ordered = r.choicesJson.every((x) => /^[\d.,\-\s]+$/.test(x)) || r.choicesJson.some((x) => /\b(first|second|third|monday|tuesday|january|february)\b/i.test(x));
      if (!ordered) {
        r.choicesJson = shuffle(r.choicesJson);
        shuffled++;
      }
    }
  }
  const final = out.slice(0, c.need + 6);
  fs.writeFileSync(`${BUNDLE}/new/${key}.json`, JSON.stringify(final, null, 1));
  report.push({ key, need: c.need, ...stat, kept: final.length, verified, unreadable: missing, skew: Number(skew.toFixed(2)), shuffled });
}
fs.copyFileSync(S + '/work/dedupe.json', BUNDLE + '/dedupe.json');
fs.writeFileSync(S + '/work/merge-report.json', JSON.stringify(report, null, 1));
const tot = report.reduce((a, r) => a + r.kept, 0);
console.log(`cells merged: ${report.length}, new questions: ${tot}`);
for (const r of report) console.log(`${r.key.padEnd(11)} need ${String(r.need).padStart(3)} raw ${String(r.raw).padStart(3)} drop ${String(r.dropped).padStart(2)} fix ${String(r.fixed).padStart(2)} invalid ${r.invalid} dup ${r.dup} -> ${r.kept} ${r.verified ? '' : '(UNVERIFIED)'} skew ${r.skew}`);
