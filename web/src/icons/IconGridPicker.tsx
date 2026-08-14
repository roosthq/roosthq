import { useMemo, useState } from 'react';
import { ICON_CATALOG, type IconSetName, type CatalogEntry } from './catalog';
import LucideIcon from '../LucideIcon';

const STYLE_TABS: { id: IconSetName; label: string }[] = [
  { id: 'NOTO', label: 'Noto' },
  { id: 'TWEMOJI', label: 'Twemoji' },
  { id: 'FLUENT_3D', label: 'Fluent 3D' },
  { id: 'LUCIDE', label: 'Lucide (plain)' },
];

const SEARCH_MAX_RESULTS = 120;

// Curated categories first (the ones most likely to matter for a chores/
// rewards app), official Unicode groups after, in roughly the same order
// Unicode itself lists them.
const CATEGORY_ORDER = [
  'Celebration, awards, achievement',
  'Reward games',
  'Money / rewards / store',
  'Objects / house / chores',
  'Activities / sports / hobbies',
  'Emotion / people',
  'Animals / nature',
  'Food / drink',
  'Travel / places',
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
];

function orderCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function IconButton({ entry, activeStyle, onPick }: { entry: CatalogEntry; activeStyle: IconSetName; onPick: (key: string, set: IconSetName) => void }) {
  return (
    <button type="button" onClick={() => onPick(entry.key, activeStyle)} title={entry.label} className="rounded p-1.5 hover:bg-slate-100">
      <LucideIcon name={`${activeStyle}:${entry.key}`} size={22} />
    </button>
  );
}

// The actual full-catalog picker: a style tab per set (clicking one re-
// renders the SAME matching icons in that style, so browsing IS the style
// preview) plus search across all ~1900 concepts. When not searching, the
// full library is broken into expandable category sections instead of a
// flat truncated list - a section's icons aren't rendered into the DOM at
// all until it's opened, so having ~1900 icons total costs nothing until
// you actually look at them.
export default function IconGridPicker({
  activeStyle,
  onStyleChange,
  onPick,
  recentKeys,
}: {
  activeStyle: IconSetName;
  onStyleChange: (s: IconSetName) => void;
  onPick: (key: string, set: IconSetName) => void;
  recentKeys?: string[];
}) {
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();

  const byCategory = useMemo(() => {
    const m = new Map<string, CatalogEntry[]>();
    for (const e of ICON_CATALOG) {
      if (!m.has(e.category)) m.set(e.category, []);
      m.get(e.category)!.push(e);
    }
    return m;
  }, []);
  const categories = useMemo(() => orderCategories([...byCategory.keys()]), [byCategory]);

  const searchResults = useMemo(() => {
    if (!q) return [];
    const scored: CatalogEntry[] = [];
    for (const e of ICON_CATALOG) {
      if (e.label.toLowerCase().includes(q) || e.key.includes(q) || e.keywords.some((k) => k.toLowerCase().includes(q))) {
        scored.push(e);
        if (scored.length >= SEARCH_MAX_RESULTS) break;
      }
    }
    return scored;
  }, [q]);

  const recent = !q && recentKeys?.length ? recentKeys.map((k) => ICON_CATALOG.find((e) => e.key === k)).filter((e): e is CatalogEntry => !!e) : [];

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {STYLE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onStyleChange(t.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${activeStyle === t.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search 1,900+ icons - animals, weather, food, symbols..."
        className="mt-2 w-full rounded border px-2 py-1.5 text-sm"
      />

      {recent.length > 0 && (
        <>
          <div className="mt-2 text-xs font-medium text-slate-400">Recent</div>
          <div className="mt-1 grid grid-cols-8 gap-0.5">
            {recent.map((e) => (
              <IconButton key={e.key} entry={e} activeStyle={activeStyle} onPick={onPick} />
            ))}
          </div>
        </>
      )}

      <div className="mt-2 max-h-80 overflow-y-auto">
        {q ? (
          <>
            <div className="grid grid-cols-8 gap-0.5">
              {searchResults.map((e) => (
                <IconButton key={e.key} entry={e} activeStyle={activeStyle} onPick={onPick} />
              ))}
            </div>
            {searchResults.length === 0 && <p className="mt-2 text-center text-xs text-slate-400">No matches - try a different word.</p>}
          </>
        ) : (
          <div className="space-y-1">
            {categories.map((cat) => {
              const entries = byCategory.get(cat)!;
              const open = openCategories.has(cat);
              return (
                <div key={cat} className="rounded border">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                  >
                    <span>
                      {cat} <span className="font-normal text-slate-400">({entries.length})</span>
                    </span>
                    <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && (
                    <div className="grid grid-cols-8 gap-0.5 border-t p-1.5">
                      {entries.map((e) => (
                        <IconButton key={e.key} entry={e} activeStyle={activeStyle} onPick={onPick} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
