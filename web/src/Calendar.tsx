import { useEffect, useMemo, useState } from 'react';
import type { CalEvent } from './api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isAllDay(e: CalEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime;
}

// Which calendar day a given event belongs to.
function eventDayKey(e: CalEvent): string | null {
  if (e.start?.date) return e.start.date; // all-day: already 'YYYY-MM-DD'
  if (e.start?.dateTime) return keyOf(new Date(e.start.dateTime));
  return null;
}

function timeLabel(e: CalEvent): string {
  if (isAllDay(e)) return 'All day';
  const s = e.start?.dateTime;
  if (!s) return '';
  const opt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startStr = new Date(s).toLocaleTimeString(undefined, opt);
  if (e.end?.dateTime) return `${startStr} – ${new Date(e.end.dateTime).toLocaleTimeString(undefined, opt)}`;
  return startStr;
}

// Month-grid calendar. Reports its visible date range up so the parent can fetch
// the right events, renders them per day, and opens a detail modal on day click.
export default function Calendar({
  events,
  onRangeChange,
}: {
  events: CalEvent[];
  onRangeChange: (startISO: string, endISO: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  // 6-week grid starting on the Sunday on/before the 1st of the month.
  const gridStart = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = new Date(first);
    s.setDate(first.getDate() - first.getDay());
    s.setHours(0, 0, 0, 0);
    return s;
  }, [cursor]);

  const days = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        return d;
      }),
    [gridStart],
  );

  useEffect(() => {
    const end = new Date(gridStart);
    end.setDate(gridStart.getDate() + 42);
    onRangeChange(gridStart.toISOString(), end.toISOString());
  }, [gridStart, onRangeChange]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      const k = eventDayKey(e);
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k))!.push(e);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.start?.dateTime ?? '').localeCompare(b.start?.dateTime ?? ''));
    }
    return m;
  }, [events]);

  const todayKey = keyOf(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedEvents = selected ? byDay.get(selected) ?? [] : [];

  const shift = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{monthLabel}</h2>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">‹</button>
          <button onClick={goToday} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">Today</button>
          <button onClick={() => shift(1)} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">›</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-px overflow-hidden rounded border bg-slate-200">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-slate-50 py-1 text-center text-xs font-medium text-slate-500">{w}</div>
        ))}
        {days.map((d) => {
          const k = keyOf(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayEvents = byDay.get(k) ?? [];
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              className={`min-h-[6rem] p-1 text-left hover:bg-slate-50 ${inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'}`}
            >
              <div
                className={`mb-1 text-xs ${
                  k === todayKey ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white' : ''
                }`}
              >
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <div key={e.uid} className="flex items-center gap-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.calendarColor ?? '#94a3b8' }} />
                    <span className="truncate text-xs">{e.title ?? '(no title)'}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && <div className="text-xs text-slate-400">+{dayEvents.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <ul className="mt-3 space-y-2">
              {selectedEvents.map((e) => (
                <li key={e.uid} className="flex gap-3 rounded border p-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: e.calendarColor ?? '#94a3b8' }} />
                  <div>
                    <div className="font-medium">{e.title ?? '(no title)'}</div>
                    <div className="text-xs text-slate-500">
                      {timeLabel(e)}
                      {e.location ? ` · ${e.location}` : ''}
                    </div>
                  </div>
                </li>
              ))}
              {selectedEvents.length === 0 && <li className="text-sm text-slate-400">No events this day.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
