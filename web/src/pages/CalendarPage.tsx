import { useCallback, useEffect, useState } from 'react';
import {
  api,
  loginUrl,
  type Me,
  type GoogleCalendar,
  type SharedCalendar,
  type CalEvent,
} from '../api';
import Calendar from '../Calendar';

export default function CalendarPage({ me }: { me: Me }) {
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const refreshShared = useCallback(async () => {
    const cals = await api.sharedCalendars();
    setShared(cals);
    setVisible(new Set(cals.map((c) => c.id)));
  }, []);

  useEffect(() => {
    refreshShared();
  }, [refreshShared]);

  useEffect(() => {
    if (!range || visible.size === 0) {
      setEvents([]);
      return;
    }
    api.events([...visible], range.start, range.end).then(setEvents).catch(() => setEvents([]));
  }, [visible, range]);

  const onRangeChange = useCallback((start: string, end: string) => setRange({ start, end }), []);

  async function openPicker() {
    setPicker(await api.googleCalendars());
    setPicked(new Set());
  }

  async function doShare() {
    if (!picker) return;
    const byAccount = new Map<string, GoogleCalendar[]>();
    for (const c of picker) {
      if (!picked.has(c.googleCalendarId)) continue;
      const arr = byAccount.get(c.googleAccountId) ?? [];
      arr.push(c);
      byAccount.set(c.googleAccountId, arr);
    }
    for (const [accountId, cals] of byAccount) {
      await api.share(
        accountId,
        cals.map((c) => ({ googleCalendarId: c.googleCalendarId, name: c.name, color: c.color })),
      );
    }
    setPicker(null);
    await refreshShared();
  }

  return (
    <div>
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Calendars <span className="text-slate-400">({shared.length})</span>
          </h2>
          <div className="flex gap-2">
            <a href={`${loginUrl}?mode=self`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + Connect another of my Google accounts
            </a>
            <button onClick={openPicker} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + Add calendars
            </button>
          </div>
        </div>

        <ul className="mt-3 flex flex-wrap gap-3">
          {shared.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={visible.has(c.id)}
                onChange={(e) => {
                  const next = new Set(visible);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  setVisible(next);
                }}
              />
              <span className="h-3 w-3 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
              <span>{c.name}</span>
              <span className="text-xs text-slate-400">({c.shareCount})</span>
            </li>
          ))}
          {shared.length === 0 && <li className="text-sm text-slate-400">No calendars yet — add some above.</li>}
        </ul>
      </section>

      <Calendar events={events} onRangeChange={onRangeChange} />

      {picker && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg bg-white p-5">
            <h3 className="text-lg font-semibold">Add calendars to your family</h3>
            <ul className="mt-3 space-y-1">
              {picker.map((c) => (
                <li key={c.googleCalendarId} className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={picked.has(c.googleCalendarId)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(c.googleCalendarId);
                      else next.delete(c.googleCalendarId);
                      setPicked(next);
                    }}
                  />
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
                  <span>{c.name}</span>
                  {c.primary && <span className="text-xs text-slate-400">primary</span>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPicker(null)} className="rounded border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={doShare} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                Share selected
              </button>
            </div>
          </div>
        </div>
      )}
      {/* me is available for future per-user calendar filtering */}
      <span className="hidden">{me.id}</span>
    </div>
  );
}
