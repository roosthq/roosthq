import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Entry {
  failures: number;
  lastFailureAt: number;
  lockedUntil?: number;
}

// Escalating lockout after repeated failed guesses against a low-entropy
// credential (a local password, or worse, a 4-digit kiosk PIN). Shared by
// AuthController.localLogin and DisplayService.unlock - same mechanism, keyed
// differently (identifier vs familyId:userId) so a lockout on one never
// blocks the other.
//
// In-memory, not DB-backed: this instance is a single process, and the point
// is to blunt automated guessing while the process is up, not to survive a
// redeploy. A restart clearing the table is an accepted tradeoff, not a gap -
// anyone who can trigger a redeploy already has far more access than this
// guards against.
@Injectable()
export class LoginThrottleService {
  private attempts = new Map<string, Entry>();

  // First THRESHOLD failures are free (typos happen); every failure at or
  // past it locks for the next step, escalating so a persistent attacker
  // slows down a lot faster than a person who fat-fingered their password.
  private static readonly THRESHOLD = 5;
  private static readonly LOCK_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
  private static readonly STALE_MS = 24 * 60 * 60_000;

  constructor() {
    setInterval(() => this.prune(), 10 * 60_000);
  }

  private prune() {
    const now = Date.now();
    for (const [key, e] of this.attempts) {
      if (now - e.lastFailureAt > LoginThrottleService.STALE_MS) this.attempts.delete(key);
    }
  }

  // Call before checking the credential. Throws 429 while locked; does
  // nothing otherwise (including for a key that's never failed).
  assertNotLocked(key: string) {
    const e = this.attempts.get(key);
    if (e?.lockedUntil && e.lockedUntil > Date.now()) {
      throw new HttpException(`Too many attempts. Try again in ${humanize(e.lockedUntil - Date.now())}.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  recordFailure(key: string) {
    const now = Date.now();
    const e = this.attempts.get(key) ?? { failures: 0, lastFailureAt: now };
    e.failures += 1;
    e.lastFailureAt = now;
    if (e.failures >= LoginThrottleService.THRESHOLD) {
      const step = Math.min(e.failures - LoginThrottleService.THRESHOLD, LoginThrottleService.LOCK_STEPS_MS.length - 1);
      e.lockedUntil = now + LoginThrottleService.LOCK_STEPS_MS[step];
    }
    this.attempts.set(key, e);
  }

  // A correct credential wipes the slate - no lingering half-lockout after
  // someone finally gets their own password right.
  recordSuccess(key: string) {
    this.attempts.delete(key);
  }
}

function humanize(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
