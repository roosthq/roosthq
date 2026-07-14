import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import MembersManager from './MembersManager';
import Calendar from './Calendar';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
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
    api
      .me()
      .then(async (u) => {
        setMe(u);
        await refreshShared();
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [refreshShared]);

  // Fetch events whenever the visible calendars or the calendar's month range change.
  useEffect(() => {
    if (!me || !range || visible.size === 0) {
      setEvents([]);
      return;
    }
    api
      .events([...visible], range.start, range.end)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [me, visible, range]);

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

  async function logout() {
    await api.logout();
    setMe(null);
  }

  if (loading) return <Centered>Loading…</Centered>;

  if (!me) {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const needInvite = params.get('auth') === 'need_invite';
    const href = invite ? `${loginUrl}?invite=${encodeURIComponent(invite)}` : loginUrl;
    return (
      <Centered>
        <h1 className="text-4xl font-bold">Roost HQ</h1>
        <p className="text-slate-500">The family&apos;s home base.</p>
        {invite && <p className="text-sm text-slate-600">You&apos;ve been invited to join a family.</p>}
        {needInvite && (
          <p className="max-w-sm text-center text-sm text-amber-600">
            That account isn&apos;t part of a family yet. Ask the family owner to send you an invite link.
          </p>
        )}
        <a
          href={href}
          className="mt-4 rounded-lg bg-slate-800 px-5 py-2.5 font-medium text-white hover:bg-slate-700"
        >
          {invite ? 'Sign in with Google to join' : 'Sign in with Google'}
        </a>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-800">
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
            <MembersManager />
          </div>
        </div>
      )}

      <section className="mt-6">
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
