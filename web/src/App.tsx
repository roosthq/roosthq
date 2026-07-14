import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  loginUrl,
  type Me,
  type GoogleCalendar,
  type SharedCalendar,
  type CalEvent,
} from './api';
import ChoresPanel from './ChoresPanel';
import DisplayAccess from './DisplayAccess';

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

function eventTime(e: CalEvent): string {
  const s = e.start?.dateTime ?? e.start?.date;
  if (!s) return '';
  const d = new Date(s);
  return e.start?.date
    ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const refreshShared = useCallback(async () => {
    const cals = await api.sharedCalendars();
    setShared(cals);
    setVisible(new Set(cals.map((c) => c.id)));
  }, []);

  useEffect(() => {
    api
      .me()
      .then(async (u) => {
        setMe(u);
        await refreshShared();
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [refreshShared]);

  const range = useMemo(() => weekRange(), []);
  useEffect(() => {
    if (!me || visible.size === 0) {
      setEvents([]);
      return;
    }
    api
      .events([...visible], range.start, range.end)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [me, visible, range]);

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

  async function logout() {
    await api.logout();
    setMe(null);
  }

  if (loading) return <Centered>Loading…</Centered>;

  if (!me)
    return (
      <Centered>
        <h1 className="text-4xl font-bold">Roost HQ</h1>
        <p className="text-slate-500">The family&apos;s home base.</p>
        <a
          href={loginUrl}
          className="mt-4 rounded-lg bg-slate-800 px-5 py-2.5 font-medium text-white hover:bg-slate-700"
        >
          Connect Google
        </a>
      </Centered>
    );

  return (
    <div className="mx-auto max-w-3xl p-6 text-slate-800">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Roost HQ</h1>
          <p className="text-sm text-slate-500">
            {me.displayName} · {me.role.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <a href="/?display=1" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800">
            Open display ↗
          </a>
          <button onClick={logout} className="text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        </div>
      </header>

      {me.role === 'OWNER' && (
        <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-500">Touch display shows the checked calendars.</span>
            <button
              onClick={() => api.updateDisplaySettings({ defaultCalendarIds: [...visible] })}
              className="rounded border bg-white px-3 py-1 hover:bg-slate-100"
            >
              Save current view as display default
            </button>
            <DisplayAccess />
          </div>
        </div>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Shared calendars <span className="text-slate-400">({shared.length})</span>
          </h2>
          <div className="flex gap-2">
            <a href={`${loginUrl}?mode=self`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + My calendar
            </a>
            <a href={`${loginUrl}?mode=member`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + Family member
            </a>
            <button onClick={openPicker} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + Add calendars
            </button>
          </div>
        </div>

        <ul className="mt-3 space-y-1">
          {shared.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded px-2 py-1 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={visible.has(c.id)}
                onChange={(e) => {
                  const next = new Set(visible);
                  e.target.checked ? next.add(c.id) : next.delete(c.id);
                  setVisible(next);
                }}
              />
              <span className="h-3 w-3 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
              <span className="flex-1">{c.name}</span>
              <span className="text-xs text-slate-400">shared by {c.shareCount}</span>
            </li>
          ))}
          {shared.length === 0 && (
            <li className="py-2 text-sm text-slate-400">No calendars yet — add some above.</li>
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">This week</h2>
        <ul className="mt-3 space-y-1">
          {events.map((e) => (
            <li key={e.uid} className="flex items-center gap-3 rounded px-2 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.calendarColor ?? '#94a3b8' }} />
              <span className="w-40 text-sm text-slate-500">{eventTime(e)}</span>
              <span className="flex-1">{e.title ?? '(no title)'}</span>
              {e.location && <span className="text-xs text-slate-400">{e.location}</span>}
            </li>
          ))}
          {events.length === 0 && (
            <li className="py-2 text-sm text-slate-400">No events in the selected calendars this week.</li>
          )}
        </ul>
      </section>

      <ChoresPanel me={me} />

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
                      e.target.checked ? next.add(c.googleCalendarId) : next.delete(c.googleCalendarId);
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
              <button
                onClick={doShare}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
              >
                Share selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800">
      {children}
    </div>
  );
}
