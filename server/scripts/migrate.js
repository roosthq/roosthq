#!/usr/bin/env node
// Applies database migrations on every server start (`npm run start:prod`).
//
//   fresh database            -> `prisma migrate deploy` builds everything.
//   database already managed  -> `prisma migrate deploy` applies only what is new.
//   legacy `db push` database -> (installed before migrations existed; has the
//     tables but no _prisma_migrations history) adopted once: any drift from
//     the schema is reconciled with a NON-destructive `db push` (it refuses to
//     drop data), the 0_init baseline is marked as already applied, then
//     `migrate deploy` runs as normal.
//
// Migrations only ever move forward. Roll back by restoring the pre-update
// snapshot (the updater writes one to ./backups before each update), not by
// starting older code against a newer schema.
const { execFileSync } = require('child_process');
const path = require('path');

const BASELINE = '0_init';
const ROOT = path.join(__dirname, '..');
const SCHEMA = 'prisma/schema.prisma'; // relative to ROOT (the CLI's cwd)
// Run the Prisma CLI through node directly: no shell, so paths with spaces and
// Windows/Linux differences cannot bite.
const PRISMA_JS = require.resolve('prisma/build/index.js', { paths: [ROOT] });

function prisma(args, opts = {}) {
  return execFileSync(process.execPath, [PRISMA_JS, ...args], {
    cwd: ROOT,
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
}

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

async function tableState() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    // The database may still be starting; retry for up to ~60s.
    let lastErr;
    for (let i = 0; i < 30; i++) {
      try {
        const rows = await db.$queryRawUnsafe(
          'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
        );
        // Lowercased: MySQL on Windows/macOS folds table-name case.
        const names = new Set(rows.map((r) => String(r.name ?? r.TABLE_NAME).toLowerCase()));
        return { history: names.has('_prisma_migrations'), hasTables: names.has('family') || names.has('user') };
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastErr;
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exit(1);
  }
  const state = await tableState();

  if (!state.history && state.hasTables) {
    log('Existing database without migration history (created before migrations): adopting it.');
    let drifted = false;
    try {
      prisma(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', SCHEMA, '--exit-code'], { capture: true });
    } catch (e) {
      if (e.status === 2) drifted = true;
      else throw e;
    }
    if (drifted) {
      log('Schema differs from the database; reconciling with a non-destructive db push (fails rather than drop data).');
      prisma(['db', 'push', '--skip-generate']);
    }
    prisma(['migrate', 'resolve', '--applied', BASELINE]);
    log(`Baseline ${BASELINE} recorded.`);
  }

  prisma(['migrate', 'deploy']);
  log('Database is up to date.');
}

main().catch((e) => {
  console.error('[migrate] FAILED:', e.message || e);
  process.exit(1);
});
