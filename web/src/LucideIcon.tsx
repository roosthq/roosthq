import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { findIcon } from './icons/catalog';
import { useEffectiveIconSet } from './icons/settingsStore';

// Renders an icon stored as a plain Lucide name string (Family.tokenIcon,
// Award.icon, Countdown.emoji - all migrated off literal emoji characters,
// see the migration note in server/README or ask about roosthq-icon-
// migration). DynamicIcon lazy-imports just the one icon actually needed
// instead of bundling all ~2000 Lucide icons up front - the tradeoff is an
// async load (briefly blank, then the icon pops in), same as any lazy image.
//
// `name` is untrusted-ish (comes from the DB, and a pre-migration row or a
// still-unmigrated custom value could be almost anything) - DynamicIcon
// itself already no-ops (renders nothing) on an unrecognized name rather
// than throwing, so a stray/legacy value degrades to "no icon shown", not a
// crash. That's acceptable here: every write path (IconPicker) only ever
// writes a name this file's own lucideData.ts curated list offers, so an
// unrecognized value only happens for data this migration didn't reach.
//
// Icon-overhaul (2026-08): every name that's ALSO in the icons/catalog.ts
// curated list (the same ~200 names, since the catalog reuses lucideData.ts
// verbatim) now renders through whichever colorful set (Noto/Twemoji/
// Fluent-3D) the family (or the platform default) has picked for that
// concept, defaulting to Noto - see IconsService.effective and
// icons/settingsStore.ts. A name outside the catalog (a hand-typed exact
// Lucide name via IconPicker's manual field, or a pure-chrome name that was
// never part of the curated list) always renders the plain Lucide glyph,
// unaffected - this is automatic from the catalog membership check, not a
// per-call-site flag, so nothing else in the app needed to change.
export default function LucideIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number | string;
  className?: string;
}) {
  const entry = findIcon(name);
  // useEffectiveIconSet always runs (React hook rules) - harmless no-op
  // lookup when `name` isn't a catalog key at all.
  const resolvedSet = useEffectiveIconSet(name);

  if (entry && resolvedSet && resolvedSet !== 'LUCIDE') {
    const ext = resolvedSet === 'FLUENT_3D' ? 'png' : 'svg';
    const folder = resolvedSet === 'NOTO' ? 'noto' : resolvedSet === 'TWEMOJI' ? 'twemoji' : 'fluent3d';
    const px = typeof size === 'number' ? `${size}px` : size;
    return (
      <img
        src={`/icons/${folder}/${entry.key}.${ext}`}
        alt=""
        className={className}
        style={{ width: px, height: px, display: 'inline-block', objectFit: 'contain' }}
        draggable={false}
      />
    );
  }

  // Pre-load flash, explicit 'LUCIDE' style, or not a catalog key at all -
  // plain Lucide glyph. entry?.lucideFallback covers the 2 catalog keys
  // (slot-machine, plinko-ball) that aren't themselves real Lucide names.
  const lucideName = entry?.lucideFallback ?? name;
  return <DynamicIcon name={lucideName as IconName} size={size} className={className} />;
}
