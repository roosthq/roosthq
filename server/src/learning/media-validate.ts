// Strict validators for owner-uploaded Learning media. The client resizes and
// re-encodes everything to the one canonical shape below, and the server
// re-checks the bytes themselves (never the client's claim), so a custom
// picture or sound can't be an odd size, format or length that breaks a layout.

export const MEDIA_SPEC = {
  // One picture shape for question photos AND picture choices: 4:3.
  image: { width: 800, height: 600, maxBytes: 900_000 },
  // 16-bit PCM WAV, mono, 44.1 kHz.
  audio: { sampleRate: 44100, channels: 1, bits: 16, maxMs: 15_000, minMs: 300, maxBytes: 1_400_000 },
} as const;

export interface ImageInfo {
  mime: 'image/webp' | 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

export interface AudioInfo {
  mime: 'audio/wav';
  durationMs: number;
}

const u16le = (b: Buffer, o: number) => b.readUInt16LE(o);
const u24le = (b: Buffer, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

// Reads the real format and size out of the file's own header. null = not a
// WebP/PNG/JPEG we can read.
export function parseImage(buf: Buffer): ImageInfo | null {
  if (buf.length < 30) return null;
  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // WebP
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8 ') {
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
      return { mime: 'image/webp', width: u16le(buf, 26) & 0x3fff, height: u16le(buf, 28) & 0x3fff };
    }
    if (kind === 'VP8L') {
      if (buf[20] !== 0x2f) return null;
      const width = 1 + (((buf[22] & 0x3f) << 8) | buf[21]);
      const height = 1 + (((buf[24] & 0x0f) << 10) | (buf[23] << 2) | ((buf[22] & 0xc0) >> 6));
      return { mime: 'image/webp', width, height };
    }
    if (kind === 'VP8X') return { mime: 'image/webp', width: 1 + u24le(buf, 24), height: 1 + u24le(buf, 27) };
    return null;
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) return null;
      const marker = buf[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = buf.readUInt16BE(o + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: 'image/jpeg', height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
      }
      o += 2 + len;
    }
    return null;
  }
  return null;
}

// Reads a canonical PCM WAV: exactly the format the in-app editor produces.
export function parseWav(buf: Buffer): AudioInfo | null {
  if (buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let o = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let dataBytes = -1;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ' && size >= 16 && o + 24 <= buf.length) {
      fmt = { format: u16le(buf, o + 8), channels: u16le(buf, o + 10), rate: buf.readUInt32LE(o + 12), bits: u16le(buf, o + 22) };
    } else if (id === 'data') {
      dataBytes = Math.min(size, buf.length - (o + 8));
      break;
    }
    o += 8 + size + (size % 2);
  }
  if (!fmt || dataBytes <= 0) return null;
  const s = MEDIA_SPEC.audio;
  if (fmt.format !== 1 || fmt.channels !== s.channels || fmt.rate !== s.sampleRate || fmt.bits !== s.bits) return null;
  return { mime: 'audio/wav', durationMs: Math.round((dataBytes / (fmt.rate * fmt.channels * (fmt.bits / 8))) * 1000) };
}

export function decodeDataUri(dataUri: string, kind: 'IMAGE' | 'AUDIO'): Buffer | null {
  const m = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUri ?? '');
  if (!m) return null;
  if (!m[1].toLowerCase().startsWith(kind === 'IMAGE' ? 'image/' : 'audio/')) return null;
  return Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
}

// Where a question's media may point: a built-in file shipped with the app, or
// an uploaded EduMedia row.
const STATIC_IMAGE = /^learning\/img\/[A-Za-z0-9][A-Za-z0-9_\-./]*\.(webp|png|jpe?g)$/i;
const STATIC_AUDIO = /^learning\/audio\/[A-Za-z0-9][A-Za-z0-9_\-./]*\.(mp3|ogg|wav|m4a)$/i;
const CUSTOM = /^api\/learning\/media\/([a-z0-9]{10,40})$/;

export function isStaticMediaPath(p: string, kind: 'IMAGE' | 'AUDIO'): boolean {
  return !p.includes('..') && (kind === 'IMAGE' ? STATIC_IMAGE : STATIC_AUDIO).test(p);
}

export function customMediaId(p: string): string | null {
  return CUSTOM.exec(p)?.[1] ?? null;
}

export const customMediaPath = (id: string) => `api/learning/media/${id}`;
