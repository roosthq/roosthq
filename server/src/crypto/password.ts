import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Same scrypt-with-per-secret-salt approach as pin.ts, kept as its own module
// since passwords and PINs have different length/complexity expectations and
// callers shouldn't have to think about PINs when they mean passwords.
// Stored as "salt:derivedKey" hex.

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const dk = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${dk}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, dk] = stored.split(':');
  if (!salt || !dk) return false;
  const check = scryptSync(password, salt, 32);
  const known = Buffer.from(dk, 'hex');
  return check.length === known.length && timingSafeEqual(check, known);
}
