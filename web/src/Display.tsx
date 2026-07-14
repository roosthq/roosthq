import { useEffect, useState } from 'react';
import { BASE_URL, type CalEvent, type DisplaySettings } from './api';

const token = new URLSearchParams(window.location.search).get('token');

// Build a display URL, carrying the kiosk token when present (Pi has no cookie).
function displayUrl(path: string): string {
  if (!token) return `${BASE_URL}${path}`;
  return `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

async function dfetch<T>(path: string): Promise<T> {
  const res = await fetch(displayUrl(path), { credentials: 'include' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

function fmt(e: CalEvent): string {
  const s = e.start?.dateTime ?? e.start?.date;
  if (!s) return '';
  const d = new Date(s);
  return e.start?.date
    ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : d.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
}

// Kiosk view for the wall-mounted touch display. Authenticates via the owner-minted
// display token in the URL (?token=...), or the owner's own cookie when previewing.
// Re-renders live when the owner changes settings (SSE).
export default function Display() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    try {
      setEvents(await dfetch<CalEvent[]>('/display/events'));
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    dfetch<DisplaySettings>('/display/settings')
      .then((s) => {
        setSettings(s);
        loadEvents();
      })
      .catch(() => setError('This display link is invalid or was revoked. Ask the family owner for a new one.'));

    const es = new EventSource(displayUrl('/display/stream'), { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        setSettings(JSON.parse(ev.data) as DisplaySettings);
        loadEvents();
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, []);

  if (error)
    return <div className="flex min-h-screen items-center justify-center p-10 text-center text-slate-500">{error}</div>;
  if (!settings)
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading display…</div>;

  const dark = settings.theme === 'dark';
  return (
    <div className={`min-h-screen p-10 ${dark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800'}`}>
      <header className="flex items-baseline justify-between border-b pb-4">
        <h1 className="text-5xl font-bold">Roost HQ</h1>
        <span className="text-2xl text-slate-400">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </header>

      {settings.enabledFeatures.includes('calendar') && (
        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-slate-400">This week</h2>
          <ul className="mt-4 space-y-3">
            {events.map((e) => (
              <li key={e.uid} className="flex items-center gap-5 text-2xl">
                <span className="h-3 w-3 rounded-full" style={{ background: e.calendarColor ?? '#94a3b8' }} />
                <span className="w-72 text-slate-400">{fmt(e)}</span>
                <span className="flex-1">{e.title ?? '(no title)'}</span>
              </li>
            ))}
            {events.length === 0 && <li className="text-xl text-slate-400">No events this week.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
