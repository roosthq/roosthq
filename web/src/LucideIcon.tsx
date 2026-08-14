import { DynamicIcon, type IconName } from 'lucide-react/dynamic';

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
export default function LucideIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number | string;
  className?: string;
}) {
  return <DynamicIcon name={name as IconName} size={size} className={className} />;
}
