import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CalEvent } from './api';
import Modal from './Modal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isAllDay(e: CalEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime;
}

function dayStart(e: CalEvent): Date | null {
  if (e.start?.date) return new Date(`${e.start.date}T00:00:00`);
  if (e.start?.dateTime) {
    const d = new Date(e.start.dateTime);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// Last day (inclusive) the event should render on. Google all-day ends are exclusive;
// timed events ending exactly at midnight shouldn't paint the following day.
function dayEnd(e: CalEvent): Date | null {
  if (e.end?.date) {
    const d = new Date(`${e.end.date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (e.end?.dateTime) {
    const d = new Date(e.end.dateTime);
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// Every day key an event covers (so multi-day events span across the grid).
function coveredDays(e: CalEvent): string[] {
  const s = dayStart(e);
  if (!s) return [];
  let end = dayEnd(e);
  if (!end || end < s) end = s;
  const keys: string[] = [];
  const cur = new Date(s);
  for (let i = 0; cur <= end && i < 90; i++) {
    keys.push(keyOf(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
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

function Avatar({ name, src, size = 'sm' }: { name?: string; src?: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-6 w-6 text-xs' : 'h-4 w-4 text-[9px]';
  if (src) return <img src={src} alt={name ?? ''} className={`${cls} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-300 font-medium text-slate-700`}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

// Month-grid calendar. Reports its visible range up so the parent fetches the right
// events; renders them per day (multi-day events span), and opens a day detail modal.
export default function Calendar({
  events,
  onRangeChange,
  size = 'normal',
  fill = false,
  renderExtra,
}: {
  events: CalEvent[];
  onRangeChange: (startISO: string, endISO: string) => void;
  // 'mini' is the small "windows-style" side calendar for the kiosk's
  // person-focused layout — day numbers and per-calendar dots only, no event
  // text (there's no room for it), but still fully clickable/navigable.
  size?: 'normal' | 'large' | 'compact' | 'mini';
  // Stretch the day grid to fill the parent's height (rows share it equally)
  // instead of sizing each cell to a fixed min-height. Parent must give this
  // component a bounded height (e.g. flex-1 in a flex column) for it to work.
  fill?: boolean;
  // Extra content under an event's description in the day-detail modal —
  // lets a caller bolt on domain-specific actions (e.g. chore claim/complete
  // buttons) without this component knowing anything about chores.
  renderExtra?: (e: CalEvent) => ReactNode;
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  const large = size === 'large';
  const compact = size === 'compact';
  const mini = size === 'mini';
  const cellMin = large ? 'min-h-[9rem]' : compact ? 'min-h-[4rem]' : mini ? 'min-h-[2.25rem]' : 'min-h-[6rem]';
  const chipText = large ? 'text-sm' : 'text-xs';
  const maxChips = large ? 6 : compact ? 2 : 3;

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
      for (const k of coveredDays(e)) {
        const arr = m.get(k);
        if (arr) arr.push(e);
        else m.set(k, [e]);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const aAll = isAllDay(a) ? 0 : 1;
        const bAll = isAllDay(b) ? 0 : 1;
        if (aAll !== bAll) return aAll - bAll;
        return (a.start?.dateTime ?? '').localeCompare(b.start?.dateTime ?? '');
      });
    }
    return m;
  }, [events]);

  const todayKey = keyOf(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedEvents = selected ? byDay.get(selected) ?? [] : [];

  const shift = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  return (
    <section className={fill ? 'flex h-full flex-col' : 'mt-6'}>
      <div className="flex shrink-0 items-center justify-between">
        <h2 className={large ? 'text-3xl font-bold' : mini ? 'text-sm font-semibold' : 'text-xl font-semibold'}>{monthLabel}</h2>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className={`rounded border hover:bg-slate-50 ${mini ? 'px-1.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>‹</button>
          {!mini && (
            <button onClick={goToday} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">Today</button>
          )}
          <button onClick={() => shift(1)} className={`rounded border hover:bg-slate-50 ${mini ? 'px-1.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>›</button>
        </div>
      </div>

      <div
        className={`mt-3 grid grid-cols-7 gap-px overflow-hidden rounded border bg-slate-200 ${fill ? 'flex-1' : ''}`}
        style={fill ? { gridTemplateRows: `auto repeat(6, minmax(0, 1fr))` } : undefined}
      >
        {WEEKDAYS.map((w) => (
          <div key={w} className={`bg-slate-50 text-center font-medium text-slate-500 ${large ? 'py-1 text-sm' : mini ? 'py-0.5 text-[10px]' : 'py-1 text-xs'}`}>
            {mini ? w.slice(0, 1) : w}
          </div>
        ))}
        {days.map((d) => {
          const k = keyOf(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === todayKey;
          const dayEvents = byDay.get(k) ?? [];
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              className={`${fill ? 'h-full min-h-0 overflow-hidden' : cellMin} p-1 text-left ${inMonth ? 'bg-white' : 'text-slate-400'}`}
              style={{
                background: isToday
                  ? 'rgba(212,192,106,0.16)'
                  : inMonth
                    ? undefined
                    : 'var(--surface-off)',
                boxShadow: isToday ? 'inset 0 0 0 2px var(--today)' : undefined,
              }}
            >
              <div
                className={`${mini ? 'mb-0.5 text-[11px]' : 'mb-1'} ${large ? 'text-base' : 'text-xs'} font-medium ${
                  isToday ? `inline-flex items-center justify-center rounded-full ${mini ? 'h-4 w-4' : 'h-6 w-6'}` : ''
                }`}
                style={isToday ? { background: 'var(--today)', color: '#1c2e1c' } : undefined}
              >
                {d.getDate()}
              </div>
              {mini ? (
                <div className="flex flex-wrap gap-0.5">
                  {Array.from(new Set(dayEvents.map((e) => e.calendarColor ?? '#94a3b8')))
                    .slice(0, 6)
                    .map((color) => <span key={color} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />)}
                </div>
              ) : (
                <>
                  {/* Full title+avatar chips on wider screens; below sm there's only
                      room for a per-calendar dot + count — tap the day for the rest. */}
                  <div className="hidden space-y-0.5 sm:block">
                    {dayEvents.slice(0, maxChips).map((e) => (
                      <div key={`${e.uid}-${k}`} className={`flex items-center gap-1 ${chipText}`}>
                        <Avatar name={e.ownerName} src={e.ownerAvatar} />
                        <span className="h-2 w-1 shrink-0 rounded" style={{ background: e.calendarColor ?? '#94a3b8' }} />
                        <span className="truncate">{e.title ?? '(no title)'}</span>
                      </div>
                    ))}
                    {dayEvents.length > maxChips && (
                      <div className={`text-slate-400 ${chipText}`}>+{dayEvents.length - maxChips} more</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 sm:hidden">
                    {Array.from(
                      dayEvents.reduce((m, e) => {
                        const cur = m.get(e.calendarId);
                        if (cur) cur.count++;
                        else m.set(e.calendarId, { color: e.calendarColor ?? '#94a3b8', count: 1 });
                        return m;
                      }, new Map<string, { color: string; count: number }>()),
                    ).map(([calendarId, { color, count }]) => (
                      <span key={calendarId} className="inline-flex items-center gap-0.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="text-[10px] leading-none text-slate-500">{count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <Modal
          maxWidthClass="max-w-lg"
          onBackdropClick={() => setSelected(null)}
          header={
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
          }
        >
          <ul className="space-y-2">
            {selectedEvents.map((e) => (
              <li key={`${e.uid}-detail`} className="flex gap-3 rounded border p-3">
                <Avatar name={e.ownerName} src={e.ownerAvatar} size="md" />
                <div className="min-w-0">
                  <div className="font-medium">{e.title ?? '(no title)'}</div>
                  <div className="text-sm text-slate-500">
                    {timeLabel(e)}
                    {e.location ? ` · ${e.location}` : ''}
                  </div>
                  {e.description && <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap break-words">{e.description}</div>}
                  {e.ownerName && <div className="text-xs text-slate-400">{e.ownerName}</div>}
                  {e.addedByName && <div className="text-xs text-slate-400">Added by {e.addedByName}</div>}
                  {renderExtra?.(e)}
                </div>
              </li>
            ))}
            {selectedEvents.length === 0 && <li className="text-sm text-slate-400">No events this day.</li>}
          </ul>
        </Modal>
      )}
    </section>
  );
}
