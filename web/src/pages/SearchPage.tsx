import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type SearchHit, type SearchResult } from '../api';
import LucideIcon from '../LucideIcon';

const EMPTY: SearchResult = { chores: [], events: [], notifications: [], rules: [], prizes: [], awards: [] };

const SECTIONS: Array<{ key: keyof SearchResult; icon: string; label: string }> = [
  { key: 'chores', icon: 'check-square', label: 'Chores' },
  { key: 'events', icon: 'calendar', label: 'Calendar events' },
  { key: 'notifications', icon: 'bell', label: 'Your notifications' },
  { key: 'rules', icon: 'clipboard-list', label: 'Rules' },
  { key: 'prizes', icon: 'shopping-bag', label: 'Store' },
  { key: 'awards', icon: 'trophy', label: 'Awards' },
];

// Searches everything the app itself stores - chores, local calendar events,
// your own notifications, rules, the store, and (adult+ only) the award
// catalog. Google Calendar events aren't included: those live on Google's
// servers, not ours, and querying that live per keystroke isn't worth it.
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      api
        .search(trimmed)
        .then(setResult)
        .catch(() => setResult(EMPTY))
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(debounceRef.current);
  }, [q]);

  useEffect(() => {
    const next = q.trim();
    setParams(next ? { q: next } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const total = SECTIONS.reduce((n, s) => n + result[s.key].length, 0);

  function go(hit: SearchHit) {
    // Chores has its own search box already - carry the query over so
    // clicking a hit doesn't dump you on an unfiltered list.
    navigate(hit.link === '/chores' ? `/chores?q=${encodeURIComponent(q.trim())}` : hit.link);
  }

  return (
    <div className="min-w-0 space-y-4">
      <h2 className="text-lg font-semibold">Search</h2>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search chores, calendar, rules, store…"
        className="w-full rounded border px-3 py-2.5 text-base"
      />

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="text-sm text-slate-400">Keep typing… (2+ characters)</p>
      )}

      {loading && <p className="text-sm text-slate-400">Searching…</p>}

      {!loading && q.trim().length >= 2 && total === 0 && (
        <p className="text-sm text-slate-400">Nothing found for &quot;{q.trim()}&quot;.</p>
      )}

      {!loading &&
        SECTIONS.map((s) => {
          const hits = result[s.key];
          if (hits.length === 0) return null;
          return (
            <section key={s.key} className="panel">
              <h3 className="flex items-center gap-1 text-sm font-semibold tracking-tight text-slate-500">
                <LucideIcon name={s.icon} size={14} /> {s.label}
              </h3>
              <ul className="mt-2 space-y-1">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => go(h)}
                      className="card-nested flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate">{h.label}</span>
                      {h.sublabel && <span className="shrink-0 text-xs text-slate-400">{h.sublabel}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      {q.trim().length === 0 && (
        <p className="text-sm text-slate-400">
          Searches chores, your calendar, your notifications, rules, and the store. Quick links:{' '}
          <Link to="/chores" className="underline">
            Chores
          </Link>
          ,{' '}
          <Link to="/rules" className="underline">
            Rules
          </Link>
          ,{' '}
          <Link to="/store" className="underline">
            Store
          </Link>
          .
        </p>
      )}
    </div>
  );
}
