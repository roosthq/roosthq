import { useMemo, useState } from 'react';
import { ICON_CATALOG, type IconSetName, type CatalogEntry } from './catalog';
import LucideIcon from '../LucideIcon';

const STYLE_TABS: { id: IconSetName; label: string }[] = [
  { id: 'NOTO', label: 'Noto' },
  { id: 'TWEMOJI', label: 'Twemoji' },
  { id: 'FLUENT_3D', label: 'Fluent 3D' },
  { id: 'LUCIDE', label: 'Lucide (plain)' },
];

const MAX_RESULTS = 120;

// The actual full-catalog picker: a style tab per set (clicking one re-
// renders the SAME matching icons in that style, so browsing IS the style
// preview) plus search across all ~1900 concepts (curated Lucide names +
// the full non-skin-toned Unicode emoji library). Presentational only - the
// caller decides what a click does (write a compound string, write a
// {iconKey,iconSet} pair to a slot, etc).
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
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return ICON_CATALOG.slice(0, MAX_RESULTS);
    const scored: CatalogEntry[] = [];
    for (const e of ICON_CATALOG) {
      if (e.label.toLowerCase().includes(q) || e.key.includes(q) || e.keywords.some((k) => k.toLowerCase().includes(q))) {
        scored.push(e);
        if (scored.length >= MAX_RESULTS) break;
      }
    }
    return scored;
  }, [q]);

  const recent = !q && recentKeys?.length ? recentKeys.map((k) => ICON_CATALOG.find((e) => e.key === k)).filter((e): e is CatalogEntry => !!e) : [];

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
              <button
                key={e.key}
                type="button"
                onClick={() => onPick(e.key, activeStyle)}
                title={e.label}
                className="rounded p-1.5 hover:bg-slate-100"
              >
                <LucideIcon name={`${activeStyle}:${e.key}`} size={22} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-2 max-h-72 overflow-y-auto">
        <div className="grid grid-cols-8 gap-0.5">
          {results.map((e) => (
            <button key={e.key} type="button" onClick={() => onPick(e.key, activeStyle)} title={e.label} className="rounded p-1.5 hover:bg-slate-100">
              <LucideIcon name={`${activeStyle}:${e.key}`} size={22} />
            </button>
          ))}
        </div>
        {results.length === 0 && <p className="mt-2 text-center text-xs text-slate-400">No matches - try a different word.</p>}
        {!q && <p className="mt-2 text-center text-[10px] text-slate-400">Showing the first {MAX_RESULTS} - search narrows this to any of the full set.</p>}
      </div>
    </div>
  );
}
