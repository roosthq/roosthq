import { useEffect, useMemo, useState } from 'react';
import { api, type IconSettingsResponse } from '../api';
import LucideIcon from '../LucideIcon';
import { ICON_CATALOG, ICON_SETS, type IconSetName, type CatalogEntry } from '../icons/catalog';
import { refreshIconSettings } from '../icons/settingsStore';

const SET_LABEL: Record<IconSetName, string> = { LUCIDE: 'Lucide (plain)', NOTO: 'Noto', TWEMOJI: 'Twemoji', FLUENT_3D: 'Fluent 3D' };

const CATEGORY_ORDER = [
  'Celebration, awards, achievement',
  'Reward games',
  'Emotion / people',
  'Animals / nature',
  'Food / drink',
  'Activities / sports / hobbies',
  'Travel / places',
  'Objects / house / chores',
  'Money / rewards / store',
  'Symbols',
];

// One row: current effective render + a 3-way style picker, "Use default"
// clears the override for this tier (falls back to the next tier down, or
// hardcoded Noto). Shared shape for both the family tier and (owner-only)
// the platform-default tier - `onSet`/`current`/`overridden` swap meaning
// per caller.
function IconRow({
  entry,
  effectiveSet,
  overrideSet,
  onSet,
  busy,
}: {
  entry: CatalogEntry;
  effectiveSet: string;
  overrideSet: string | undefined;
  onSet: (iconSet: string | null) => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <LucideIcon name={entry.key} size={28} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.label}</div>
        {!overrideSet && <div className="text-xs text-slate-400">Using default ({SET_LABEL[effectiveSet as IconSetName] ?? effectiveSet})</div>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {ICON_SETS.map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => onSet(s)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              overrideSet === s ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'
            }`}
          >
            {SET_LABEL[s]}
          </button>
        ))}
        {overrideSet && (
          <button disabled={busy} onClick={() => onSet(null)} className="rounded-full border px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
            Use default
          </button>
        )}
      </div>
    </div>
  );
}

function CatalogGrid({
  query,
  effective,
  overrides,
  onSet,
  busyKey,
}: {
  query: string;
  effective: Record<string, string>;
  overrides: Record<string, string>;
  onSet: (key: string, iconSet: string | null) => void;
  busyKey: string | null;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q ? ICON_CATALOG.filter((e) => e.label.toLowerCase().includes(q) || e.keywords.some((k) => k.toLowerCase().includes(q))) : ICON_CATALOG;
  const byCategory = new Map<string, CatalogEntry[]>();
  for (const e of filtered) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category)!.push(e);
  }
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  if (filtered.length === 0) return <p className="text-sm text-slate-400">No icons match "{query}".</p>;

  return (
    <div className="space-y-5">
      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat}</h4>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {byCategory.get(cat)!.map((entry) => (
              <IconRow
                key={entry.key}
                entry={entry}
                effectiveSet={effective[entry.key]}
                overrideSet={overrides[entry.key]}
                onSet={(s) => onSet(entry.key, s)}
                busy={busyKey === entry.key}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Settings -> Family -> Icons. Family Manager+ picks which colorful set each
// concept renders with, family-wide; the instance owner gets a second
// section underneath setting the platform-wide default every OTHER family
// inherits (unless they've picked their own override here). Both write
// through the exact same resolve chain LucideIcon reads at render time
// (family -> app -> hardcoded Noto), so a change here is visible everywhere
// that concept is used app+kiosk-wide, immediately.
export default function IconsTab({ isOwner }: { isOwner: boolean }) {
  const [data, setData] = useState<IconSettingsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [scope, setScope] = useState<'family' | 'platform'>('family');

  const refresh = () => api.iconSettings().then(setData).catch(() => undefined);
  useEffect(() => {
    refresh();
  }, []);

  const effective = useMemo(() => data?.effective ?? {}, [data]);

  async function setFamily(key: string, iconSet: string | null) {
    setBusyKey(key);
    try {
      await api.setFamilyIconSetting(key, iconSet);
      await refresh();
      refreshIconSettings(); // live-update every <LucideIcon/> already on screen
    } finally {
      setBusyKey(null);
    }
  }

  async function setApp(key: string, iconSet: string | null) {
    setBusyKey(key);
    try {
      await api.setAppIconSetting(key, iconSet);
      await refresh();
      refreshIconSettings();
    } finally {
      setBusyKey(null);
    }
  }

  if (!data) return <p className="text-sm text-slate-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Every icon in the app defaults to Noto. Pick a different style for any concept below - the change applies everywhere that icon shows up, app
        and kiosk both, right away.
      </p>
      {isOwner && (
        <div className="flex gap-1 border-b pb-2 text-sm">
          <button
            onClick={() => setScope('family')}
            className={`rounded px-3 py-1 ${scope === 'family' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
          >
            This family
          </button>
          <button
            onClick={() => setScope('platform')}
            className={`rounded px-3 py-1 ${scope === 'platform' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
          >
            Platform default
          </button>
        </div>
      )}
      {scope === 'platform' && (
        <p className="text-xs text-slate-400">
          Sets the default every family inherits unless they've picked their own style here under "This family".
        </p>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons..."
        className="w-full rounded border px-3 py-2 text-sm sm:max-w-xs"
      />
      <CatalogGrid
        query={query}
        effective={effective}
        overrides={scope === 'family' ? data.familySet : data.appSet}
        onSet={scope === 'family' ? setFamily : setApp}
        busyKey={busyKey}
      />
    </div>
  );
}
