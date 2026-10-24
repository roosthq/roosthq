// Deterministic quality gate for Learning question JSON (PLANNING.md §19).
// Catches the mechanical errors that slipped into the first bank (an answer
// already printed in its own sequence, duplicate choices, an answer that isn't
// one of the choices, same prompt asked at several grades, wrong arithmetic).
// It cannot judge wording or facts - reviewers do that - but nothing with a
// failure here should ever be inserted.
//
// Usage (from server/):
//   node prisma/tools/edu-validate.js <file-or-dir> [--media-root ../web/public] [--json report.json]
// A dir is read as <SUBJECT>-<GRADE>*.json files. Exit code 1 if any ERROR.
//
// Row shape (same as seed-data/edu-questions): {type, prompt, choicesJson?,
// answer, acceptedAnswers?, tags?, visualJson?, media?}. `id`/`grade`/`subject`
// are accepted when present (exports) and used for reporting only.

const fs = require('fs');
const path = require('path');

const TYPES = ['MULTIPLE_CHOICE', 'TEXT_INPUT', 'IMAGE_CHOICE'];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}⭐❤️‍]/u;
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normPrompt = (s) => norm(s).replace(/[^a-z0-9 ]/g, '');

function evalSimple(expr) {
  // Only digits, spaces, + - * / and parentheses ever reach eval-by-Function.
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  try {
    const v = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function checkArithmetic(q, out) {
  const p = q.prompt.replace(/×|(?<=[\d)\s])x(?=\s*[\d(])/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const m = p.match(/(?:what is|solve|find|calculate|compute)?[:\s]*([\d\s+\-*/().]{3,40})\s*=\s*(?:\?|_+|\s*$)/i);
  if (!m) return;
  const expr = m[1].trim();
  if (!/[+\-*/]/.test(expr)) return;
  const v = evalSimple(expr);
  if (v === null) return;
  const given = Number(String(q.answer).replace(/,/g, ''));
  if (Number.isFinite(given) && Math.abs(given - v) > 1e-9) out.push(['ERROR', `arithmetic: "${expr}" = ${v} but answer is "${q.answer}"`]);
}

function checkSequence(q, out) {
  if (!/(comes next|next number|next in|missing number|what number)/i.test(q.prompt)) return;
  const nums = (q.prompt.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));
  if (nums.length >= 4 && new Set(nums).size === nums.length && nums.includes(String(q.answer).replace(/,/g, '')) && /comes next|next number|next in/i.test(q.prompt)) {
    out.push(['ERROR', `sequence: answer "${q.answer}" already appears in the prompt's own sequence`]);
  }
}

function validateRow(q, ctx) {
  const out = [];
  const err = (m) => out.push(['ERROR', m]);
  const warn = (m) => out.push(['WARN', m]);
  if (!q || typeof q !== 'object') return [['ERROR', 'not an object']];
  if (!TYPES.includes(q.type)) err(`unknown type "${q.type}"`);
  if (typeof q.prompt !== 'string' || !q.prompt.trim()) err('empty prompt');
  if (typeof q.answer !== 'string' || !q.answer.trim()) err('empty answer');
  if (out.length) return out;

  const prompt = q.prompt;
  if (prompt.length > 420) warn(`prompt very long (${prompt.length} chars)`);
  if (/\s{2,}/.test(prompt)) warn('double space in prompt');
  if (/&amp;|&lt;|&gt;|&quot;/.test(prompt + q.answer)) err('HTML entity in text');
  if (/^[a-z]/.test(prompt.trim())) warn('prompt starts lowercase');
  if (!/[?.!:_)"'”]$/.test(prompt.trim()) && !/_{2,}|\.\.\./.test(prompt)) warn('prompt has no ending punctuation');
  if (/\ba (?=[aeiou]\w)(?!uni|use|usu|one|once|eu)/i.test(prompt)) warn('"a" before a vowel sound - check a/an');
  if (/\ban (?=[bcdfgjklmnpqrstvwxyz]\w)(?!hour|honest|heir|hono)/i.test(prompt)) warn('"an" before a consonant - check a/an');
  if (/\b(\w+) \1\b/i.test(prompt) && !/\b(that that|had had)\b/i.test(prompt)) warn('repeated word');

  if (q.type === 'MULTIPLE_CHOICE' || q.type === 'IMAGE_CHOICE') {
    const c = q.choicesJson ?? q.choices;
    if (!Array.isArray(c) || c.length < 2) err('needs at least 2 choices');
    else {
      if (c.length > 6) warn(`${c.length} choices`);
      const normed = c.map(norm);
      if (new Set(normed).size !== c.length) err('duplicate choices');
      if (!c.some((x) => x === q.answer)) err(`answer "${q.answer}" is not exactly one of the choices`);
      if (c.some((x) => typeof x !== 'string' || !x.trim())) err('blank choice');
      if (EMOJI_RE.test(q.answer) && q.type === 'TEXT_INPUT') err('emoji in typed answer');
      if (c.filter((x) => norm(x) === norm(q.answer)).length > 1) err('answer duplicated among choices');
      if (/all of the above|none of the above|both a and b/i.test(c.join('|'))) warn('"all/none of the above" style choice');
    }
    if (q.type === 'IMAGE_CHOICE') {
      const ci = q.media && q.media.choiceImages;
      if (!Array.isArray(ci) || ci.length !== (q.choicesJson ?? q.choices ?? []).length) err('IMAGE_CHOICE needs media.choiceImages matching choices');
    }
  } else {
    if (q.choicesJson || q.choices) warn('TEXT_INPUT should not carry choices');
    if (EMOJI_RE.test(q.answer)) err('emoji in typed answer');
    if (q.answer.length > 40) warn('typed answer is long - hard for a kid to match exactly');
  }
  if (q.acceptedAnswers !== undefined) {
    if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.some((a) => typeof a !== 'string' || !a.trim())) err('acceptedAnswers must be non-empty strings');
    else if (q.type !== 'TEXT_INPUT') warn('acceptedAnswers only matter for TEXT_INPUT');
  }
  if (q.media) {
    for (const key of ['image', 'audio']) {
      if (q.media[key]) {
        if (!/^learning\/(img|audio)\/[\w.\-\/]+$/.test(q.media[key])) err(`media.${key} path must look like learning/img/x.webp`);
        else if (ctx.mediaRoot && !fs.existsSync(path.join(ctx.mediaRoot, q.media[key]))) err(`media file missing: ${q.media[key]}`);
      }
    }
    for (const f of q.media.choiceImages || []) {
      if (ctx.mediaRoot && !fs.existsSync(path.join(ctx.mediaRoot, f))) err(`choice image missing: ${f}`);
    }
    if ((q.media.image || q.media.audio) && !q.media.alt) warn('media without alt text');
  }
  checkArithmetic(q, out);
  checkSequence(q, out);
  return out;
}

function loadInput(target) {
  const st = fs.statSync(target);
  const files = st.isDirectory() ? fs.readdirSync(target).filter((f) => f.endsWith('.json')).map((f) => path.join(target, f)) : [target];
  const rows = [];
  for (const f of files) {
    const m = path.basename(f).match(/^([A-Z]+)-(\d+)/);
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(data)) continue;
    data.forEach((q, i) => rows.push({ ...q, __file: path.basename(f), __i: i, __subject: q.subject ?? (m && m[1]), __grade: q.grade ?? (m && Number(m[2])) }));
  }
  return rows;
}

function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--media-root' && args[args.indexOf(a) - 1] !== '--json');
  if (!target) {
    console.error('usage: edu-validate.js <file-or-dir> [--media-root dir] [--json out.json]');
    process.exit(2);
  }
  const mr = args.indexOf('--media-root');
  const ctx = { mediaRoot: mr >= 0 ? path.resolve(args[mr + 1]) : null };
  const jo = args.indexOf('--json');
  const rows = loadInput(target);
  const issues = [];
  for (const q of rows) {
    if (q.active === false) continue;
    for (const [level, msg] of validateRow(q, ctx)) issues.push({ level, id: q.id, file: q.__file, i: q.__i, subject: q.__subject, grade: q.__grade, prompt: String(q.prompt ?? '').slice(0, 100), msg });
  }
  // Duplicates: same normalized prompt AND same answer within a subject, any grade.
  const seen = new Map();
  for (const q of rows) {
    if (q.active === false || !q.prompt) continue;
    const key = `${q.__subject}|${normPrompt(q.prompt)}|${norm(q.answer)}|${q.media ? JSON.stringify(q.media) : ''}`;
    if (seen.has(key)) {
      const first = seen.get(key);
      issues.push({ level: 'ERROR', id: q.id, file: q.__file, i: q.__i, subject: q.__subject, grade: q.__grade, prompt: String(q.prompt).slice(0, 100), msg: `duplicate of ${first.id ?? first.__file + "#" + first.__i} (${first.__subject} g${first.__grade})${first.__grade !== q.__grade ? ' (different grade)' : ''}` });
    } else seen.set(key, q);
  }
  const errors = issues.filter((x) => x.level === 'ERROR');
  const warns = issues.filter((x) => x.level === 'WARN');
  if (jo >= 0) fs.writeFileSync(args[jo + 1], JSON.stringify(issues, null, 1));
  const byMsg = {};
  for (const x of issues) byMsg[`${x.level} ${x.msg.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 60)}`] = (byMsg[`${x.level} ${x.msg.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 60)}`] || 0) + 1;
  console.log(`${rows.length} rows checked: ${errors.length} errors, ${warns.length} warnings`);
  Object.entries(byMsg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  process.exitCode = errors.length ? 1 : 0;
}

if (require.main === module) main();
module.exports = { validateRow, norm, normPrompt };
