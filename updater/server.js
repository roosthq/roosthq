// Roost HQ updater - tiny internal-only HTTP service. See PLANNING.md #15
// for the full design and why this is a separate container: the main
// `server` container never gets the host repo checkout or docker.sock
// itself - only this dedicated, unpublished service does, reachable
// exclusively from `server` over the internal Docker network and gated by
// a shared-secret bearer token on every request.
const express = require('express');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const execFileAsync = util.promisify(execFile);

const PORT = process.env.PORT || 4100;
const REPO_PATH = process.env.HOST_REPO_PATH || '/opt/roost-hq';
const SHARED_SECRET = process.env.UPDATE_SHARED_SECRET;
const REPO_URL = process.env.UPDATE_REPO_URL || 'https://github.com/roosthq/roosthq.git';
const DEFAULT_BRANCH = process.env.UPDATE_BRANCH || 'main';
const COMPOSE_FILES = ['-f', 'docker-compose.yml', '-f', 'docker-compose.prod.yml'];

if (!SHARED_SECRET) {
  console.error('UPDATE_SHARED_SECRET is not set - refusing to start (this service would otherwise accept unauthenticated update requests).');
  process.exit(1);
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${SHARED_SECRET}`) return res.status(401).json({ message: 'Unauthorized' });
  next();
});

// Single global job state - one instance, one update at a time, same shape
// as nomad-eye's own updater. Deliberately in-memory only (resets on
// container restart) except previousCommit, which the caller (server) is
// handed directly in the /update response and persists on its own side -
// this service itself stays stateless across restarts by design.
let job = { inProgress: false, lastResult: null, lastRanAt: null };

async function git(...args) {
  const { stdout } = await execFileAsync('git', ['-C', REPO_PATH, ...args], { timeout: 60_000 });
  return stdout.trim();
}

async function currentVersion() {
  let sha = null;
  let tag = null;
  let dirty = false;
  try {
    sha = await git('rev-parse', 'HEAD');
  } catch {
    /* not a git repo somehow - version stays null */
  }
  try {
    tag = await git('describe', '--tags', '--exact-match', 'HEAD');
  } catch {
    tag = null; // not exactly on a tag - normal on the latest/main channel
  }
  try {
    const status = await git('status', '--porcelain');
    dirty = status.length > 0;
  } catch {
    /* ignore */
  }
  return { sha, shortSha: sha ? sha.slice(0, 7) : null, tag, dirty };
}

// Highest-looking semver tag on the remote, via `git ls-remote` - works
// identically for a public or private repo (uses whatever git credentials
// this container has - see the .ssh mount in docker-compose.prod.yml) and
// has no API token/rate-limit to manage, unlike the GitHub REST API.
async function latestTag(repoUrl) {
  const { stdout } = await execFileAsync('git', ['ls-remote', '--tags', '--sort=v:refname', repoUrl], { timeout: 15_000 });
  const tags = stdout
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((p) => p.length === 2 && p[1].startsWith('refs/tags/') && !p[1].endsWith('^{}'))
    .map((p) => p[1].slice('refs/tags/'.length));
  return tags.length ? tags[tags.length - 1] : null;
}

async function latestOnBranch(repoUrl, branch) {
  const { stdout } = await execFileAsync('git', ['ls-remote', repoUrl, `refs/heads/${branch}`], { timeout: 15_000 });
  const sha = stdout.split(/\s+/)[0];
  return sha || null;
}

const compose = (...rest) => execFileAsync('docker', ['compose', ...COMPOSE_FILES, ...rest], { cwd: REPO_PATH, timeout: 300_000 });

// Every update first writes a gzipped mysqldump to ./backups. Schema
// migrations only move forward, so this snapshot is the way back if a
// release goes wrong (restore steps: DEPLOY.md). Keeps the newest 5.
const SNAPSHOT_KEEP = 5;
async function snapshotDatabase() {
  const dir = path.join(REPO_PATH, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pre-update_${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`);
  await new Promise((resolve, reject) => {
    const dump = spawn(
      'docker',
      ['compose', ...COMPOSE_FILES, 'exec', '-T', 'db', 'sh', '-c', 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'],
      { cwd: REPO_PATH },
    );
    const out = fs.createWriteStream(file);
    let err = '';
    dump.stderr.on('data', (d) => (err += d));
    dump.stdout.pipe(zlib.createGzip()).pipe(out);
    dump.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => {
      // A dump that produced almost nothing is a failed dump, not a backup.
      if (fs.statSync(file).size < 1024) reject(new Error(`database snapshot looks empty: ${err.trim().slice(0, 200)}`));
      else resolve();
    });
    dump.on('close', (code) => {
      if (code !== 0) reject(new Error(`database snapshot failed (exit ${code}): ${err.trim().slice(0, 200)}`));
    });
  }).catch((e) => {
    fs.rmSync(file, { force: true });
    throw e;
  });
  const old = fs.readdirSync(dir).filter((f) => f.startsWith('pre-update_')).sort().slice(0, -SNAPSHOT_KEEP);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return file;
}

// The server container applies migrations itself on boot (scripts/migrate.js),
// so "the update worked" means "the server came back healthy", not "a command
// exited 0". A failed migration keeps the server from ever becoming healthy.
async function waitForHealthy(snapshot) {
  const probe = "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    try {
      await execFileAsync('docker', ['compose', ...COMPOSE_FILES, 'exec', '-T', 'server', 'node', '-e', probe], { cwd: REPO_PATH, timeout: 15_000 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error(
    `The server did not become healthy after the update (a migration may have failed - check "docker compose logs server"). ` +
      `A database snapshot from just before the update is at ${snapshot}.`,
  );
}

async function runUpdate(channel, branch) {
  const snapshot = await snapshotDatabase();

  if (channel === 'latest') {
    await execFileAsync('git', ['-C', REPO_PATH, 'fetch', 'origin', branch], { timeout: 60_000 });
    await execFileAsync('git', ['-C', REPO_PATH, 'reset', '--hard', `origin/${branch}`], { timeout: 30_000 });
  } else {
    const tag = await latestTag(REPO_URL);
    if (!tag) throw new Error('No release tag found on the remote');
    await execFileAsync('git', ['-C', REPO_PATH, 'fetch', '--tags'], { timeout: 60_000 });
    await execFileAsync('git', ['-C', REPO_PATH, 'checkout', `tags/${tag}`], { timeout: 30_000 });
  }
  await compose('up', '-d', '--build', 'server', 'web');
  await waitForHealthy(snapshot);
}

app.get('/version', async (req, res) => {
  try {
    res.json(await currentVersion());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get('/check', async (req, res) => {
  const channel = req.query.channel === 'latest' ? 'latest' : 'stable';
  const branch = req.query.branch || DEFAULT_BRANCH;
  try {
    if (channel === 'latest') {
      const sha = await latestOnBranch(REPO_URL, branch);
      res.json({ channel, latest: sha, shortLatest: sha ? sha.slice(0, 7) : null });
    } else {
      const tag = await latestTag(REPO_URL);
      res.json({ channel, latest: tag, shortLatest: tag });
    }
  } catch (e) {
    res.status(502).json({ message: e.message });
  }
});

app.get('/status', (req, res) => res.json(job));

app.post('/update', async (req, res) => {
  if (job.inProgress) return res.status(409).json({ message: 'An update is already in progress' });
  const channel = req.body?.channel === 'latest' ? 'latest' : 'stable';
  const branch = req.body?.branch || DEFAULT_BRANCH;

  let previousCommit;
  try {
    previousCommit = await git('rev-parse', 'HEAD');
  } catch (e) {
    return res.status(500).json({ message: `Could not read current version: ${e.message}` });
  }

  job = { inProgress: true, lastResult: null, lastRanAt: new Date().toISOString() };
  res.json({ started: true, channel, previousCommit });

  try {
    await runUpdate(channel, branch);
    job = { inProgress: false, lastResult: 'success', lastRanAt: job.lastRanAt };
  } catch (e) {
    job = { inProgress: false, lastResult: `error: ${e.message}`, lastRanAt: job.lastRanAt };
  }
});

// One level of rollback: check out a specific commit (the previousCommit
// the last /update handed back) and rebuild - same pipeline as a `latest`-
// channel update, just against a fixed sha instead of the branch tip.
app.post('/rollback', async (req, res) => {
  if (job.inProgress) return res.status(409).json({ message: 'An update is already in progress' });
  const commit = req.body?.commit;
  if (!commit) return res.status(400).json({ message: 'commit is required' });

  job = { inProgress: true, lastResult: null, lastRanAt: new Date().toISOString() };
  res.json({ started: true });

  try {
    const snapshot = await snapshotDatabase();
    await execFileAsync('git', ['-C', REPO_PATH, 'fetch', 'origin'], { timeout: 60_000 });
    await execFileAsync('git', ['-C', REPO_PATH, 'reset', '--hard', commit], { timeout: 30_000 });
    await compose('up', '-d', '--build', 'server', 'web');
    await waitForHealthy(snapshot);
    job = { inProgress: false, lastResult: 'success', lastRanAt: job.lastRanAt };
  } catch (e) {
    job = { inProgress: false, lastResult: `error: ${e.message}`, lastRanAt: job.lastRanAt };
  }
});

app.listen(PORT, () => console.log(`roosthq-updater listening on :${PORT}, repo=${REPO_PATH}`));
