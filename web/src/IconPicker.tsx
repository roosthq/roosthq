import { useEffect, useRef, useState } from 'react';
import { EMOJI_LIBRARY } from './emojiData';

const RECENT_KEY = 'rhq.recentEmoji';
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

function pushRecent(emoji: string) {
  const next = [emoji, ...loadRecent().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage can throw in a locked-down/private context - recent-use
    // is a nicety, not worth surfacing an error for.
  }
}

// One shared searchable emoji picker for every icon field in the app (awards,
// countdowns, the reward token icon, and anywhere else that takes a short
// emoji string) - replaces the mix of ad hoc curated grids, plain text
// inputs, and a <select> that existed before. Search matches name or
// keyword; a "paste any emoji" fallback stays available since the curated
// library, however broad, still isn't the full Unicode set.
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

  function pick(emoji: string) {
    onChange(emoji);
    pushRecent(emoji);
    setOpen(false);
    setQuery('');
  }

  const q = query.trim().toLowerCase();
  const results = (q
    ? EMOJI_LIBRARY.filter((e) => e.name.includes(q) || e.keywords.some((k) => k.includes(q)))
    : EMOJI_LIBRARY
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
        {isImage ? <img src={value} alt="" className="h-full w-full rounded object-cover" /> : value || '❓'}
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
                {recent.map((em, i) => (
                  <button key={i} type="button" onClick={() => pick(em)} className="rounded p-1 text-lg hover:bg-slate-100">
                    {em}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-2 max-h-56 overflow-y-auto">
            <div className="grid grid-cols-8 gap-0.5">
              {results.map((entry) => (
                <button
                  key={entry.emoji}
                  type="button"
                  onClick={() => pick(entry.emoji)}
                  title={entry.name}
                  className="rounded p-1 text-lg hover:bg-slate-100"
                >
                  {entry.emoji}
                </button>
              ))}
            </div>
            {results.length === 0 && (
              <p className="mt-2 text-center text-xs text-slate-400">No matches - try a different word, or paste any emoji below.</p>
            )}
          </div>
          <input
            value={isImage ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="...or paste any emoji"
            maxLength={8}
            className="mt-2 w-full rounded border px-2 py-1.5 text-center text-sm"
          />
        </div>
      )}
    </div>
  );
}
