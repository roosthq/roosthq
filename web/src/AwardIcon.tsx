import LucideIcon from './LucideIcon';

// Renders an award's icon: an uploaded image (data URI) or a catalog/Lucide
// key. Lives in its own file - not AwardsPage - so the kiosk can show award
// icons without pulling the whole admin page (and the icon picker's 300KB
// catalog) in with it.
// `size` is a pixel dimension (not a Tailwind className - an SVG icon's
// size isn't controlled by font-size the way the old emoji <span> was).
export function AwardIcon({ icon, size = 24 }: { icon: string | null; size?: number }) {
  if (icon?.startsWith('data:')) return <img src={icon} alt="" className="h-7 w-7 rounded object-cover" />;
  return <LucideIcon name={icon || 'trophy'} size={size} />;
}
