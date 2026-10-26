// Regenerates src/icons/catalogIndex.ts - the slim key -> {styles, ext,
// fallback} lookup LucideIcon renders from - out of src/icons/catalog.ts.
// catalog.ts is ~330KB (labels + search keywords for the picker); the kiosk
// only ever needs to know which art sets a key has, so it ships this instead
// and the picker alone pulls the full catalog. Run after regenerating
// catalog.ts:  node scripts/gen-icon-index.cjs
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/icons/catalog.ts'), 'utf8');
const start = src.indexOf('export const ICON_CATALOG: CatalogEntry[] = [');
const end = src.indexOf('\n];', start);
const arr = src.slice(src.indexOf('[', start + 'export const ICON_CATALOG: CatalogEntry[] ='.length - 1), end + 3);
const entries = new Function('return ' + arr)();
const CODE = { NOTO: 'N', TWEMOJI: 'T', FLUENT_3D: 'F' };
const rows = entries.map((e) => {
  const styles = e.available.map((s) => CODE[s]).join('');
  const val = e.lucideFallback ? `['${styles}', '${e.fluentExt}', '${e.lucideFallback}']` : `'${styles}${e.fluentExt === 'png' ? 'p' : 's'}'`;
  return `  '${e.key}': ${val},`;
});
const out = `// AUTO-GENERATED from catalog.ts by scripts/gen-icon-index.cjs - do not hand-edit.
// key -> art sets this concept has (N=Noto, T=Twemoji, F=Fluent 3D) followed by the
// Fluent file type (p=png, s=svg); a [styles, ext, lucideFallback] tuple when the
// key isn't itself a real Lucide icon name.
import type { IconSetName } from './catalog';

const SET_BY_CODE: Record<string, IconSetName> = { N: 'NOTO', T: 'TWEMOJI', F: 'FLUENT_3D' };

const INDEX: Record<string, string | [string, string, string]> = {
${rows.join('\n')}
};

export interface IconInfo {
  available: IconSetName[];
  fluentExt: 'svg' | 'png';
  lucideFallback?: string;
}

const cache = new Map<string, IconInfo | undefined>();

export function iconInfo(key: string): IconInfo | undefined {
  if (cache.has(key)) return cache.get(key);
  const raw = Object.prototype.hasOwnProperty.call(INDEX, key) ? INDEX[key] : undefined;
  let info: IconInfo | undefined;
  if (raw) {
    const [styles, ext, fallback] = typeof raw === 'string' ? [raw.slice(0, -1), raw.slice(-1) === 'p' ? 'png' : 'svg', undefined] : raw;
    info = { available: [...styles].map((c) => SET_BY_CODE[c]), fluentExt: ext === 'png' ? 'png' : 'svg', lucideFallback: fallback };
  }
  cache.set(key, info);
  return info;
}
`;
fs.writeFileSync(path.join(__dirname, '../src/icons/catalogIndex.ts'), out);
console.log('wrote catalogIndex.ts with', entries.length, 'entries,', out.length, 'bytes');
