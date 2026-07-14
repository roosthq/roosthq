import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM encryption for Google OAuth tokens stored at rest.
// Key comes from TOKEN_ENCRYPTION_KEY (32 bytes / 64 hex chars).

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Generate: openssl rand -hex 32');
  }
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
