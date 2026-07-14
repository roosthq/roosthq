import { useEffect, useState } from 'react';
import { api, displayStreamUrl, type CalEvent, type DisplaySettings } from './api';

function weekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}

function fmt(e: CalEvent): string {
  const s = e.start?.dateTime ?? e.start?.date;
  if (!s) return '';
  const d = new Date(s);
  return e.start?.date
    ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : d.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
}

// Kiosk view for the wall-mounted touch display. Reads owner-controlled settings
// and re-renders live when the owner changes them (via SSE).
export default function Display() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents(ids: string[]) {
    if (!ids.length) {
      setEvents([]);
      return;
    }
    const { start, end } = weekRange();
    try {
      setEvents(await api.events(ids, start, end));
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    api
      .displaySettings()
      .then((s) => {
        setSettings(s);
        loadEvents(s.defaultCalendarIds);
      })
      .catch(() => setError('Sign in on this device first, then reload display mode.'));

    const es = new EventSource(displayStreamUrl, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const s = JSON.parse(ev.data) as DisplaySettings;
        setSettings(s);
        loadEvents(s.defaultCalendarIds);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, []);

  if (error)
    return <div className="flex min-h-screen items-center justify-center text-slate-500">{error}</div>;
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
