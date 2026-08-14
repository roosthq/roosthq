import { useEffect, useRef, useState } from 'react';
import { LUCIDE_LIBRARY } from './lucideData';
import LucideIcon from './LucideIcon';

const RECENT_KEY = 'rhq.recentIcon';
const MAX_RECENT = 16;
const MAX_RESULTS = 64;

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(name: string) {
  const next = [name, ...loadRecent().filter((n) => n !== name)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage can throw in a locked-down/private context - recent-use
    // is a nicety, not worth surfacing an error for.
  }
}

// One shared searchable icon picker for every icon field in the app (awards,
// countdowns, the reward token icon) - stores a Lucide icon name (e.g.
// "party-popper"), not an emoji character (see roosthq-icon-migration for
// why: a fresh Pi image has no emoji font by default, and emoji render
// wildly differently across devices/OS versions - an SVG icon set doesn't
// have either problem). Search matches name or keyword; a manual text field
// stays available for the ~1800 real Lucide icons outside this curated
// couple-hundred (an unrecognized name just renders nothing, not an error -
// see LucideIcon's own doc comment).
export default function IconPicker({
  value,
  onChange,
  buttonSize = 'h-10 w-10 text-xl',
}: {
  value: string;
  onChange: (icon: string) => void;
  buttonSize?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setRecent(loadRecent());
  }, [open]);

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function pick(name: string) {
    onChange(name);
    pushRecent(name);
    setOpen(false);
    setQuery('');
  }

  const q = query.trim().toLowerCase();
  const results = (q
    ? LUCIDE_LIBRARY.filter((e) => e.name.includes(q) || e.keywords.some((k) => k.includes(q)))
    : LUCIDE_LIBRARY
  ).slice(0, MAX_RESULTS);

  const isImage = value?.startsWith('data:');

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Pick an icon"
        className={`flex shrink-0 items-center justify-center rounded border hover:bg-slate-50 ${buttonSize}`}
      >
        {isImage ? (
          <img src={value} alt="" className="h-full w-full rounded object-cover" />
        ) : (
          <LucideIcon name={value || 'help-circle'} />
        )}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-lg border bg-white p-3 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
          {!q && recent.length > 0 && (
            <>
              <div className="mt-2 text-xs font-medium text-slate-400">Recent</div>
              <div className="mt-1 grid grid-cols-8 gap-0.5">
                {recent.map((name, i) => (
                  <button key={i} type="button" onClick={() => pick(name)} title={name} className="rounded p-1.5 hover:bg-slate-100">
                    <LucideIcon name={name} size={18} />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-2 max-h-56 overflow-y-auto">
            <div className="grid grid-cols-8 gap-0.5">
              {results.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => pick(entry.name)}
                  title={entry.label}
                  className="rounded p-1.5 hover:bg-slate-100"
                >
                  <LucideIcon name={entry.name} size={18} />
                </button>
              ))}
            </div>
            {results.length === 0 && (
              <p className="mt-2 text-center text-xs text-slate-400">No matches - try a different word, or type an exact icon name below.</p>
            )}
          </div>
          <input
            value={isImage ? '' : value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="...or type an exact icon name"
            className="mt-2 w-full rounded border px-2 py-1.5 text-center text-sm"
          />
          <p className="mt-1 text-center text-[10px] text-slate-400">
            Browse the full set at{' '}
            <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" className="underline">
              lucide.dev/icons
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
