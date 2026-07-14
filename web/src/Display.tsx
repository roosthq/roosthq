import { useCallback, useEffect, useState } from 'react';
import { BASE_URL, type CalEvent, type DisplaySettings } from './api';
import Calendar from './Calendar';

const token = new URLSearchParams(window.location.search).get('token');

// Build a display URL, carrying the kiosk token when present (the Pi has no cookie).
function displayUrl(path: string): string {
  if (!token) return `${BASE_URL}${path}`;
  return `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

async function dfetch<T>(path: string): Promise<T> {
  const res = await fetch(displayUrl(path), { credentials: 'include' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

// Kiosk view for the wall-mounted touch display. Shows the full month calendar,
// authenticated via the display token (?token=...) or the owner's cookie. Re-renders
// live when the owner changes display settings (SSE).
export default function Display() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dfetch<DisplaySettings>('/display/settings')
      .then(setSettings)
      .catch(() => setError('This display link is invalid or was revoked. Ask the family owner for a new one.'));

    const es = new EventSource(displayUrl('/display/stream'), { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        setSettings(JSON.parse(ev.data) as DisplaySettings);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, []);

  // Refetch when the visible month changes, or when settings change (e.g. the owner
  // switched which calendars the display shows).
  useEffect(() => {
    if (!range) return;
    dfetch<CalEvent[]>(
      `/display/events?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
    )
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [range, settings]);

  const onRangeChange = useCallback((s: string, e: string) => setRange({ start: s, end: e }), []);

  if (error)
    return <div className="flex min-h-screen items-center justify-center p-10 text-center text-slate-500">{error}</div>;
  if (!settings)
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading display…</div>;

  const showCalendar = settings.enabledFeatures.includes('calendar');

  return (
    <div className="min-h-screen bg-white p-8 text-slate-800">
      <header className="flex items-baseline justify-between border-b pb-4">
        <h1 className="text-4xl font-bold">Roost HQ</h1>
        <span className="text-xl text-slate-400">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </header>

      {showCalendar ? (
        <Calendar events={events} onRangeChange={onRangeChange} />
      ) : (
        <p className="mt-8 text-slate-400">Calendar is turned off in display settings.</p>
      )}
    </div>
  );
}
