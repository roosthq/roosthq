import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// PIN hashing (scrypt with per-PIN salt). Stored as "salt:derivedKey" hex.
// PINs are low-entropy, so the kiosk unlock endpoint should be rate-limited in
// front of this (a reverse-proxy or app-level limiter) for defense in depth.

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const dk = scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${dk}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, dk] = stored.split(':');
  if (!salt || !dk) return false;
  const check = scryptSync(pin, salt, 32);
  const known = Buffer.from(dk, 'hex');
  return check.length === known.length && timingSafeEqual(check, known);
}
