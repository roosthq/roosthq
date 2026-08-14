import { useEffect, useRef, useState } from 'react';
import LucideIcon from './LucideIcon';
import IconGridPicker from './icons/IconGridPicker';
import type { IconSetName } from './icons/catalog';

const RECENT_KEY = 'rhq.recentIcon';
const MAX_RECENT = 16;

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

function parseCompound(value: string): { key: string; set: IconSetName | null } {
  const m = /^(LUCIDE|NOTO|TWEMOJI|FLUENT_3D):(.+)$/i.exec(value);
  return m ? { key: m[2], set: m[1].toUpperCase() as IconSetName } : { key: value, set: null };
}

// One shared searchable icon picker for every icon field in the app (awards,
// countdowns, the reward token icon). Stores either a bare catalog key (e.g.
// "party-popper" - renders in Noto, or whatever a family/app default ever
// resolves it to) or an explicit "STYLE:key" compound (e.g.
// "TWEMOJI:party-popper") when the person picked a specific style rather
// than leaving it on the default - see LucideIcon's own doc comment. A
// manual text field stays available for typing an exact Lucide name outside
// the curated set (an unrecognized name just renders nothing, not an error).
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
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isImage = value?.startsWith('data:');
  const parsed = isImage ? { key: '', set: null } : parseCompound(value);
  const [activeStyle, setActiveStyle] = useState<IconSetName>(parsed.set ?? 'NOTO');

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

  function pick(key: string, set: IconSetName) {
    // "Use default" (Noto) writes the bare key, same as before this session
    // - Default is Noto anyway, and staying bare means this pick keeps
    // matching a future platform-default change; any other explicit style
    // choice is pinned (an explicit choice shouldn't silently drift later).
    const written = set === 'NOTO' ? key : `${set}:${key}`;
    onChange(written);
    pushRecent(written);
    setOpen(false);
  }

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Pick an icon"
        className={`flex shrink-0 items-center justify-center rounded border hover:bg-slate-50 ${buttonSize}`}
      >
        {isImage ? <img src={value} alt="" className="h-full w-full rounded object-cover" /> : <LucideIcon name={value || 'help-circle'} />}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-80 rounded-lg border bg-white p-3 shadow-lg">
          <IconGridPicker activeStyle={activeStyle} onStyleChange={setActiveStyle} onPick={pick} recentKeys={recent.map((r) => parseCompound(r).key)} />
          <input
            value={isImage ? '' : parsed.key}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="...or type an exact icon name"
            className="mt-2 w-full rounded border px-2 py-1.5 text-center text-sm"
          />
        </div>
      )}
    </div>
  );
}
