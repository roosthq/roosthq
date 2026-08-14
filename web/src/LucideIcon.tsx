import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { findIcon, type IconSetName } from './icons/catalog';
import { useSlotPick } from './icons/settingsStore';

const SET_TO_FOLDER: Record<string, string> = { NOTO: 'noto', TWEMOJI: 'twemoji', FLUENT_3D: 'fluent3d' };

function renderInSet(key: string, set: string, size: number | string, className: string | undefined) {
  const entry = findIcon(key);
  if (set === 'LUCIDE' || !entry) {
    return <DynamicIcon name={(entry?.lucideFallback ?? key) as IconName} size={size} className={className} />;
  }
  // The requested style might genuinely not exist for this concept (Noto
  // ships no country flags at all; a few brand-new emoji aren't in Twemoji
  // yet) - fall through the other real sets before giving up on an image
  // entirely, so a picked-but-unavailable style never renders broken.
  const resolvedSet = entry.available.includes(set as IconSetName) ? set : entry.available[0];
  if (!resolvedSet) {
    return <DynamicIcon name={(entry.lucideFallback ?? key) as IconName} size={size} className={className} />;
  }
  const ext = resolvedSet === 'FLUENT_3D' ? entry.fluentExt : 'svg';
  const px = typeof size === 'number' ? `${size}px` : size;
  return (
    <img
      src={`/icons/${SET_TO_FOLDER[resolvedSet]}/${key}.${ext}`}
      alt=""
      className={className}
      style={{ width: px, height: px, display: 'inline-block', objectFit: 'contain' }}
      draggable={false}
    />
  );
}

// Renders an icon. `name` is either a plain catalog/Lucide key (legacy
// behavior: falls back to plain Lucide if it's not a real catalog key -
// DynamicIcon itself no-ops on an unrecognized name rather than throwing,
// see the old doc comment history) or an explicit "SET:key" compound
// (e.g. "TWEMOJI:party-popper") written by the enhanced IconPicker for a
// per-instance field (Award.icon/Family.tokenIcon/Countdown.emoji) where the
// user picked a specific style rather than "use the default" - that always
// wins over everything else, it's an explicit per-instance choice.
//
// `slot` (icon-overhaul, 2026-08) opts a call site into the family/app slot
// override system (Settings -> Icons): if the family or platform owner has
// picked a DIFFERENT icon+style for this named UI position, that renders
// instead of `name` - see icons/slots.ts for the id list. Omit `slot`
// for anything that isn't a customizable position (a per-instance field
// already covered by its own picker, or a name outside the slot catalog).
export default function LucideIcon({
  name,
  slot,
  size = 20,
  className,
}: {
  name: string;
  slot?: string;
  size?: number | string;
  className?: string;
}) {
  const compound = /^(LUCIDE|NOTO|TWEMOJI|FLUENT_3D):(.+)$/i.exec(name);
  if (compound) return renderInSet(compound[2], compound[1].toUpperCase(), size, className);

  const slotPick = useSlotPick(slot);
  if (slotPick) return renderInSet(slotPick.iconKey, slotPick.iconSet, size, className);

  if (findIcon(name)) return renderInSet(name, 'NOTO', size, className);

  return <DynamicIcon name={name as IconName} size={size} className={className} />;
}
