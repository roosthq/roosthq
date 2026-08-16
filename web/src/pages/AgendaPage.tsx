import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, choreClient, type CalEvent, type Chore, type Member, type SharedCalendar } from '../api';
import { projectChoreOccurrences, choreOccurrenceEvent, PERSON_COLORS } from '../choreOccurrences';

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isAllDay(e: CalEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime;
}

// Every day key an event covers, clamped to `days` (no need to walk further
// than the one week this page ever shows at once).
function coveredDays(e: CalEvent, days: string[]): string[] {
  const startDate = e.start?.date ?? (e.start?.dateTime ? e.start.dateTime.slice(0, 10) : null);
  const endRaw = e.end?.date ?? (e.end?.dateTime ? e.end.dateTime.slice(0, 10) : null);
  if (!startDate) return [];
  let endDate = endRaw ?? startDate;
  // Google's all-day end date is exclusive.
  if (e.end?.date) {
    const d = new Date(`${e.end.date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    endDate = keyOf(d);
  }
  return days.filter((k) => k >= startDate && k <= endDate);
}

function timeLabel(e: CalEvent): string {
  if (isAllDay(e)) return 'All day';
  const s = e.start?.dateTime;
  if (!s) return '';
  const opt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  return new Date(s).toLocaleTimeString(undefined, opt);
}

// Sort key: all-day/no-time items first, then by actual clock time.
function sortMinutes(e: CalEvent): number {
  if (isAllDay(e)) return -1;
  const s = e.start?.dateTime;
  if (!s) return -1;
  const d = new Date(s);
  return d.getHours() * 60 + d.getMinutes();
}

// A printable, plain-text week agenda for the fridge - the Calendar page's
// own grid is great on a screen but cramped once you shrink it to fit paper;
// this is a vertical day-by-day list instead, same data (events + chores)
// as everywhere else, no filter UI - "everything, for the week, to print."
export default function AgendaPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => keyOf(addDays(weekStart, i))), [weekStart]);
  const rangeStart = weekStart;
  const rangeEnd = useMemo(() => {
    const e = addDays(weekStart, 7);
    e.setHours(0, 0, 0, 0);
    return e;
  }, [weekStart]);

  useEffect(() => {
    // Location-scoped (calendars shared within a house the viewer's actually
    // part of, or shared family-wide) - not the unrestricted family list;
    // same call CalendarPage's own grid already uses for this.
    api.myCalendars().then(setCalendars).catch(() => setCalendars([]));
    api.members().then(setMembers).catch(() => setMembers([]));
    choreClient()
      .chores()
      .then(setChores)
      .catch(() => setChores([]));
  }, []);

  const refreshEvents = useCallback(() => {
    if (!calendars.length) {
      setEvents([]);
      return;
    }
    api
      .events(calendars.map((c) => c.id), rangeStart.toISOString(), rangeEnd.toISOString())
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [calendars, rangeStart, rangeEnd]);
  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  const personColor = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mem, i) => m.set(mem.id, PERSON_COLORS[i % PERSON_COLORS.length]));
    return m;
  }, [members]);

  const choreEvents = useMemo(() => {
    const everyoneId = new Set(members.map((m) => m.id));
    const occurrences = projectChoreOccurrences(chores, everyoneId, rangeStart, rangeEnd);
    return occurrences.map((occ) => {
      const member = members.find((m) => m.id === occ.assigneeUserId);
      return choreOccurrenceEvent(occ, personColor.get(occ.assigneeUserId) ?? '#94a3b8', member?.displayName ?? 'Someone', member?.avatar);
    });
  }, [chores, members, rangeStart, rangeEnd, personColor]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const k of days) m.set(k, []);
    for (const e of [...events, ...choreEvents]) {
      for (const k of coveredDays(e, days)) {
        m.get(k)?.push(e);
      }
    }
    for (const k of days) m.get(k)?.sort((a, b) => sortMinutes(a) - sortMinutes(b));
    return m;
  }, [events, choreEvents, days]);

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="min-w-0 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight">Agenda</h2>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="rounded border px-2.5 py-1.5 hover:bg-slate-50">
            ‹
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded border px-2.5 py-1.5 hover:bg-slate-50">
            This week
          </button>
          <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="rounded border px-2.5 py-1.5 hover:bg-slate-50">
            ›
          </button>
          <button onClick={() => window.print()} className="ml-2 rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700">
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Print-only heading - the controls above are hidden on paper via
          .no-print, so the week range needs its own always-visible line. */}
      <h1 className="hidden text-2xl font-bold print:block">{rangeLabel}</h1>
      <p className="hidden text-sm text-slate-500 print:block">Weekly agenda</p>
      <p className="text-sm text-slate-500">{rangeLabel}</p>

      <div className="space-y-4">
        {days.map((k) => {
          const d = new Date(`${k}T00:00:00`);
          const items = byDay.get(k) ?? [];
          const isToday = k === keyOf(new Date());
          return (
            <section key={k} className="panel break-inside-avoid">
              <h3 className={`text-base font-semibold tracking-tight ${isToday ? 'text-[var(--accent)]' : ''}`}>
                {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                {isToday && <span className="ml-2 text-xs font-normal text-slate-400">Today</span>}
              </h3>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Nothing planned.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {items.map((e, i) => (
                    <li key={`${e.id}-${i}`} className="flex items-baseline gap-2 text-sm">
                      <span className="w-20 shrink-0 text-slate-400">{timeLabel(e)}</span>
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: e.calendarColor ?? '#94a3b8' }}
                      />
                      <span className="min-w-0 flex-1">
                        {e.title}
                        {e.ownerName && <span className="text-slate-400"> · {e.ownerName}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
