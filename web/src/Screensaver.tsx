import { useEffect, useState } from 'react';
import Logo from './Logo';
import { dget } from './displayApi';
import type { CalEvent, DisplayTodaySummary } from './api';
import { parseLocalDate, type WeatherNow } from './useWeather';

const REFRESH_MS = 5 * 60_000;

function isAllDay(e: CalEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime;
}

function eventTime(e: CalEvent): string {
  if (isAllDay(e)) return 'All day';
  if (!e.start?.dateTime) return '';
  return new Date(e.start.dateTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function choreTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Full-screen clock + "at a glance" (today's chores/events) + weather, shown
// after DisplayConfig.screensaverMinutes of no touch/mouse/key activity (see
// the idle-timer effect in Display.tsx). Tapping anywhere dismisses it - the
// tap itself also counts as activity via the same document-level listeners,
// so the idle timer restarts automatically.
export default function Screensaver({ weather, onDismiss }: { weather: WeatherNow | null; onDismiss: () => void }) {
  const [now, setNow] = useState(new Date());
  const [summary, setSummary] = useState<DisplayTodaySummary | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Refetches only while this component is mounted (i.e. only while the
  // screensaver is actually showing) - no point polling chores/events in the
  // background when nobody's looking at this view.
  useEffect(() => {
    let stopped = false;
    const load = () => {
      dget<DisplayTodaySummary>('/display/today')
        .then((s) => !stopped && setSummary(s))
        .catch(() => undefined);
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const chores = summary?.chores ?? [];
  const events = summary?.events ?? [];

  return (
    <div
      // onClick only - NOT onTouchStart. Dismissing on touchstart unmounts this
      // overlay mid-gesture, so the browser's synthetic click that follows
      // touchend re-hit-tests at that screen position and lands on whatever's
      // now underneath (opening a chore/event/whatever was there). Handling
      // only the final click means this overlay is still mounted for the
      // whole tap and fully absorbs it - nothing leaks through.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-8 bg-black px-8 text-white"
    >
      {/* Slow drift so the bright clock text isn't pinned to the exact same
          pixels for hours at a stretch - cheap insurance against LCD burn-in,
          imperceptible as motion. */}
      <style>{`
        @keyframes rhq-screensaver-drift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(3vw, 2vh); }
        }
      `}</style>
      <div
        className="flex w-full max-w-4xl flex-col items-center gap-8 md:flex-row md:items-start md:justify-between"
        style={{ animation: 'rhq-screensaver-drift 90s ease-in-out infinite' }}
      >
        <div className="flex flex-col items-center gap-3 md:items-start">
          <Logo size={40} />
          <div className="text-7xl font-bold tabular-nums">
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
          </div>
          <div className="flex items-center gap-3 text-lg text-slate-400">
            <span>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            {weather && (
              <span title={weather.label}>
                {weather.icon} {weather.tempF}°F
              </span>
            )}
          </div>
          {weather && weather.forecast.length > 0 && (
            <div className="mt-2 flex gap-3">
              {weather.forecast.slice(0, 7).map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-0.5 text-xs text-slate-400" title={d.label}>
                  <span>{parseLocalDate(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
                  <span className="text-base">{d.icon}</span>
                  <span>
                    {d.hi}°<span className="text-slate-600">/{d.lo}°</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-full max-w-sm text-left">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Today</div>
          <ul className="mt-2 space-y-1.5 text-lg">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className="w-20 shrink-0 text-sm text-slate-500">{eventTime(e)}</span>
                <span className="truncate">{e.title || 'Untitled event'}</span>
              </li>
            ))}
            {chores.map((c) => (
              <li key={c.id} className="flex items-baseline gap-2">
                <span className="w-20 shrink-0 text-sm text-slate-500">{choreTime(c.dueTime) || 'Today'}</span>
                <span className="truncate">
                  {c.title} <span className="text-slate-500">· {c.assignedTo}</span>
                </span>
              </li>
            ))}
            {events.length === 0 && chores.length === 0 && <li className="text-slate-500">Nothing on the books today.</li>}
          </ul>
        </div>
      </div>

      <div className="text-sm text-slate-600">Tap to wake</div>
    </div>
  );
}
