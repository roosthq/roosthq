import { useState, type ReactNode } from 'react';

// The form-safe sibling of DropdownDetails - that one closes itself on any
// outside click, which is exactly wrong for a section you're actively
// filling out inside a modal (tapping into an input elsewhere in the form
// would silently collapse it). This one only ever toggles on its own
// header tap.
//
// Rule for every call site: collapsed by default ONLY when the caller
// confirms nothing inside is actually configured (`defaultOpen={false}`
// literally means "this section has nothing on right now"). Anything with
// real state set opens automatically so a setting already in effect is
// never hidden from the adult editing it - see the Pass date-restriction
// and chore-bonus reorgs, both computed this way. `badge` renders next to
// the title (only while collapsed) so even a closed section says at a
// glance whether it's empty or not, e.g. "2 limits set".
export default function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</span>
        <span className="flex items-center gap-2">
          {badge && !open && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{badge}</span>}
          <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}
