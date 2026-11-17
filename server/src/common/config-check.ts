// Refuse to run with the placeholder secrets from .env.example. Anyone who can
// read the repo knows those values, so a server using them would let them
// forge a session cookie for any user. Called once at startup.
const PLACEHOLDER = /change-?me|changeme|example|your-|xxxx/i;

export function assertSafeConfig(): void {
  const problems: string[] = [];
  const session = process.env.SESSION_SECRET ?? '';
  const enc = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (session.length < 32 || PLACEHOLDER.test(session)) {
    problems.push('SESSION_SECRET must be a random string of at least 32 characters (generate one: openssl rand -hex 32)');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(enc)) {
    problems.push('TOKEN_ENCRYPTION_KEY must be 64 hex characters (generate one: openssl rand -hex 32)');
  }
  if (!problems.length) return;

  const message = `Unsafe configuration:\n  - ${problems.join('\n  - ')}\nSee DEPLOY.md, or run: node scripts/gen-secrets.js`;
  // Local development stays usable out of the box; anything else must be fixed.
  if (process.env.NODE_ENV === 'development' && !(process.env.WEB_URL ?? '').startsWith('https://')) {
    // eslint-disable-next-line no-console
    console.warn(`[security] WARNING (allowed only because NODE_ENV=development over http):\n${message}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(`[security] REFUSING TO START.\n${message}`);
  process.exit(1);
}
