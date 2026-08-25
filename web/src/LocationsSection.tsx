import { useCallback, useEffect, useState } from 'react';
import { api, type FamilyLocation, type Me } from './api';
import { myLocationIds } from './displayScope';

// "My Account" -> Which location(s) am I part of. Same self-join endpoint the
// blocking join modal uses (LocationJoinModal.tsx) - this is just the
// anytime, non-blocking version of the same picker, for changing your mind
// later (moved house, added a second one, etc). Nothing to show if the
// family has no locations at all.
export default function LocationsSection({ me }: { me: Me }) {
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(() => {
    api.locations().then((locs) => {
      setLocations(locs);
      setPicked(new Set(myLocationIds(locs, me.id)));
    }).catch(() => undefined);
  }, [me.id]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!picked.size) return;
    setSaving(true);
    try {
      await api.selfJoinLocations([...picked]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  if (!locations.length) return null;

  return (
    <section id="locations" className="panel scroll-mt-20">
      <h3 className="text-base font-semibold tracking-tight">Locations</h3>
      <p className="mt-1 text-sm text-slate-500">
        Which house(es) you're part of - controls which calendars, kiosk displays, and Household items you see.
      </p>
      {/* Full-width, stacked rows on a phone instead of inline pills - a
          picker with room for maybe two houses side by side was mostly
          just blank space next to a small pill on a narrow screen; a
          full-width row is both a bigger, easier tap target and a better
          use of the space actually available. Reverts to inline pills from
          sm up, where side-by-side already reads fine and multiple houses
          shouldn't each eat a whole row. */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {locations.map((l) => {
          const on = picked.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => toggle(l.id)}
              className={`w-full rounded-full border px-3 py-1.5 text-left text-sm sm:w-auto sm:text-center ${on ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
            >
              🏠 {l.name}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!picked.size || saving}
          className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Save
        </button>
        {!picked.size && <span className="text-sm text-amber-600">Pick at least one</span>}
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </section>
  );
}
