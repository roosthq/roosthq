#!/usr/bin/env node
// CI guard: every migration must be safe to run against a stranger's data.
// A migration containing DROP TABLE / DROP COLUMN / TRUNCATE / DELETE FROM
// must carry an explicit `-- destructive-ok: <reason>` line, so a destructive
// change is a conscious, reviewed decision instead of something `prisma
// migrate dev` generated while somebody was renaming a field.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'prisma', 'migrations');
const DESTRUCTIVE = /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM|DROP\s+DATABASE)\b/i;
let bad = 0;

for (const name of fs.readdirSync(dir)) {
  const sqlPath = path.join(dir, name, 'migration.sql');
  if (!fs.existsSync(sqlPath)) continue;
  if (name === '0_init') continue; // baseline, built from empty
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (DESTRUCTIVE.test(sql) && !/--\s*destructive-ok:\s*\S+/i.test(sql)) {
    console.error(`${name}: contains a destructive statement without a "-- destructive-ok: <reason>" line`);
    bad++;
  }
}

if (bad) process.exit(1);
console.log('migrations: ok');
