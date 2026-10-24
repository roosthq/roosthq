// Builds Biology photo/sound questions from the QA'd animal manifests.
const fs = require('fs');
const S = 'C:/Users/sheac/AppData/Local/Temp/claude/C--Users-sheac-Github-Personal/d3295f37-d84f-43de-aa58-cf3e2dc83375/scratchpad';
const REPO = 'C:/Users/sheac/Github Personal/Family Calendar System';
const { validateRow } = require(REPO + '/server/prisma/tools/edu-validate.js');
const OUT = REPO + '/server/prisma/seed-data/edu-sync/new';
fs.mkdirSync(OUT, { recursive: true });

let seed = 20261024;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const shuffle = (a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const animals = fs
  .readdirSync(S + '/media/manifest')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(S + '/media/manifest/' + f, 'utf8')))
  .filter((a) => a.image && a.image.file && fs.existsSync(REPO + '/web/public/' + a.image.file) && (!a.audio || fs.existsSync(REPO + '/web/public/' + a.audio.file)));
console.log('animals with media:', animals.length, '| with sound:', animals.filter((a) => a.audio).length);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (name) => (/^[aeiou]/i.test(name) && !/^(uni|use|eu)/i.test(name) ? 'an' : 'a');
const named = (a) => a.name;

function distractors(a, n, pred = () => true) {
  const pool = animals.filter((o) => o.slug !== a.slug && o.name.toLowerCase() !== a.name.toLowerCase() && pred(o));
  const same = shuffle(pool.filter((o) => o.group === a.group && Math.abs(o.level - a.level) <= 2));
  const rest = shuffle(pool.filter((o) => !same.includes(o)));
  return [...same, ...rest].slice(0, n);
}

const GROUP_LABEL = { mammal: 'Mammal', bird: 'Bird', reptile: 'Reptile', amphibian: 'Amphibian', fish: 'Fish', insect: 'Insect', arachnid: 'Spider or scorpion (arachnid)', crustacean: 'Crustacean', mollusk: 'Mollusk', cnidarian: 'Jellyfish or coral (cnidarian)' };
const HABITAT_LABEL = { farm: 'On a farm', forest: 'In a forest', jungle: 'In a jungle', savanna: 'On the savanna', desert: 'In a desert', arctic: 'In the cold Arctic', ocean: 'In the ocean', freshwater: 'In rivers and lakes', wetland: 'In a wetland', grassland: 'On grassland', mountain: 'In the mountains', backyard: 'In a backyard or garden', home: 'In people\'s homes' };
const DIET_LABEL = { herbivore: 'Plants (a herbivore)', carnivore: 'Other animals (a carnivore)', omnivore: 'Both plants and animals (an omnivore)', insectivore: 'Mostly insects (an insectivore)', 'filter-feeder': 'Tiny food filtered from the water', 'nectar-feeder': 'Sweet nectar from flowers' };

const rows = []; // {grade, row}
const add = (grade, row) => rows.push({ grade: clamp(grade, 0, 6), row });
const mc = (prompt, correct, wrongs, media, tags) => {
  const choices = shuffle([correct, ...wrongs]);
  return { type: 'MULTIPLE_CHOICE', prompt, choicesJson: choices, answer: correct, tags, media };
};
const LET = ['A', 'B', 'C', 'D'];
const pic = (prompt, a, others, audio, tags) => {
  const opts = shuffle([a, ...others]);
  const idx = opts.indexOf(a);
  const media = { choiceImages: opts.map((o) => o.image.file), choiceAlts: opts.map((_, i) => `Picture ${LET[i]}`), alt: audio ? 'Animal sound' : 'Choose a picture' };
  if (audio) media.audio = a.audio.file;
  return { type: 'IMAGE_CHOICE', prompt, choicesJson: LET.slice(0, opts.length), answer: LET[idx], tags, media };
};

for (const a of animals) {
  const addA = (g, r) => { r._a = a.slug; add(g, r); };
  const L = clamp(a.level ?? 1, 0, 4);
  const imgMedia = { image: a.image.file, alt: a.image.alt || `A photo of ${article(a.name)} ${a.name}` };
  const dn = distractors(a, 3);
  if (dn.length === 3) {
    addA(L, mc('Which animal is this?', cap(named(a)), dn.map((d) => cap(named(d))), imgMedia, ['animals', 'photo']));
    addA(L, pic(`Which picture shows ${article(a.name)} ${a.name}?`, a, dn, false, ['animals', 'photo']));
    // a second, differently-worded photo ID a grade up, for variety
    if (L < 4) addA(L + 1, mc(`What is the name of the animal in the picture?`, cap(named(a)), distractors(a, 3).map((d) => cap(named(d))), imgMedia, ['animals', 'photo']));
  }
  if (a.audio && dn.length === 3) {
    const audioMedia = { audio: a.audio.file, alt: 'Animal sound' };
    addA(L, mc('Which animal makes this sound?', cap(named(a)), dn.map((d) => cap(named(d))), audioMedia, ['animals', 'sound']));
    addA(L, pic('Listen. Which animal makes this sound?', a, distractors(a, 3), true, ['animals', 'sound']));
  }
  if (GROUP_LABEL[a.group]) {
    const wrongG = shuffle(Object.keys(GROUP_LABEL).filter((g) => g !== a.group && ['mammal', 'bird', 'reptile', 'amphibian', 'fish', 'insect'].includes(g))).slice(0, 3);
    if (['mammal', 'bird', 'reptile', 'amphibian', 'fish', 'insect', 'arachnid', 'crustacean', 'mollusk', 'cnidarian'].includes(a.group)) {
      addA(clamp(L + 1, 1, 5), mc(`What kind of animal is ${article(a.name)} ${a.name}?`, GROUP_LABEL[a.group], wrongG.map((g) => GROUP_LABEL[g]), imgMedia, ['animals', 'classification']));
    }
  }
  if (HABITAT_LABEL[a.habitat]) {
    const wrongH = shuffle(Object.keys(HABITAT_LABEL).filter((h) => h !== a.habitat)).slice(0, 3);
    addA(clamp(L + 1, 1, 5), mc(`Where does ${article(a.name)} ${a.name} usually live?`, HABITAT_LABEL[a.habitat], wrongH.map((h) => HABITAT_LABEL[h]), imgMedia, ['animals', 'habitats']));
  }
  if (DIET_LABEL[a.diet] && ['herbivore', 'carnivore', 'omnivore'].includes(a.diet)) {
    const wrongD = ['herbivore', 'carnivore', 'omnivore'].filter((d) => d !== a.diet);
    addA(clamp(L + 2, 2, 6), mc(`What does ${article(a.name)} ${a.name} mainly eat?`, DIET_LABEL[a.diet], wrongD.map((d) => DIET_LABEL[d]), imgMedia, ['animals', 'diet']));
  }
  if (a.babyName && !/^(null|none)$/i.test(a.babyName) && a.level <= 3) {
    const babies = distractors(a, 12, (o) => o.babyName && o.babyName.toLowerCase() !== a.babyName.toLowerCase()).map((o) => cap(o.babyName));
    const uniq = [...new Set(babies)].slice(0, 3);
    if (uniq.length === 3) addA(clamp(L + 1, 1, 5), mc(`What is a baby ${a.name} called?`, cap(a.babyName), uniq, imgMedia, ['animals', 'life-cycle']));
  }
}

// Validate, then write per-grade files
const byGrade = {};
let invalid = 0;
for (const { grade, row } of rows) {
  const errs = validateRow(row, { mediaRoot: REPO + '/web/public' }).filter(([l]) => l === 'ERROR');
  if (errs.length) {
    invalid++;
    console.log('invalid:', row.prompt, errs.map((e) => e[1]).join('; '));
    continue;
  }
  (byGrade[grade] ||= []).push(row);
}
const GRADE_CAP = 115;
const PER_ANIMAL = 3;
let kept = 0;
for (let g = 0; g <= 6; g++) {
  const all = shuffle(byGrade[g] || []);
  // sound questions first (rarest and most fun), then the rest
  all.sort((x, y) => Number((y.tags || []).includes('sound')) - Number((x.tags || []).includes('sound')));
  const used = {};
  const arr = [];
  for (const r of all) {
    if (arr.length >= GRADE_CAP) break;
    if ((used[r._a] || 0) >= PER_ANIMAL) continue;
    used[r._a] = (used[r._a] || 0) + 1;
    arr.push(r);
  }
  for (const r of arr) delete r._a;
  kept += arr.length;
  fs.writeFileSync(`${OUT}/BIOLOGY-${g}-media.json`, JSON.stringify(arr, null, 1));
  console.log(`BIOLOGY grade ${g}: ${arr.length} media questions (of ${all.length})`);
}
console.log('kept', kept, 'invalid', invalid);
