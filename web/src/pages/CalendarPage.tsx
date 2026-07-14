import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  loginUrl,
  type Me,
  type Member,
  type GoogleCalendar,
  type SharedCalendar,
  type CalEvent,
  type FamilyLocation,
  type DisplayConfig,
} from '../api';
import Calendar from '../Calendar';
import { myLocationIds, displaysForLocations } from '../displayScope';

function Avatar({ name, src }: { name?: string; src?: string }) {
  if (src) return <img src={src} alt={name ?? ''} className="h-10 w-10 rounded-full object-cover" />;
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-300 font-semibold text-slate-700">
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

function Dashboard({ me }: { me: Me }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [tokenName, setTokenName] = useState('Tokens');

  useEffect(() => {
    api.members().then(setMembers).catch(() => setMembers([]));
    api.tokenBalances().then((b) => setBalances(Object.fromEntries(b.map((x) => [x.userId, x.balance])))).catch(() => undefined);
    api.familySettings().then((f) => setTokenName(f.tokenName)).catch(() => undefined);
  }, []);

  if (members.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight">Family</h2>
      <ul className="mt-3 flex flex-wrap gap-3">
        {members.map((m) => (
          <li key={m.id}>
            <Link
              to={m.id === me.id ? '/profile' : `/profile/${m.id}`}
              className="panel flex items-center gap-3 hover:bg-slate-50"
            >
              <Avatar name={m.displayName} src={m.avatar} />
              <span>
                <span className="block font-medium">{m.displayName}</span>
                <span className="block text-xs text-slate-400">{m.role.toLowerCase()}</span>
              </span>
              <span className="ml-2 text-lg font-bold" style={{ color: 'var(--accent)' }}>
                {balances[m.id] ?? 0}
                <span className="ml-1 text-xs font-normal text-slate-400">{tokenName}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CalendarPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Kids don't get a calendar picker — their view is auto-scoped to whatever
  // location(s) they're assigned to and that location's display calendars.
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [myDisplays, setMyDisplays] = useState<DisplayConfig[]>([]);
  useEffect(() => {
    if (isAdult) return;
    Promise.all([api.locations(), api.listDisplays()])
      .then(([locs, disps]) => {
        setLocations(locs);
        setMyDisplays(disps);
      })
      .catch(() => undefined);
  }, [isAdult]);

  // Union of calendarIds across the kid's location-scoped display(s); null means
  // "no restriction configured yet" (no location or no display for it) — falls
  // back to showing every shared calendar rather than an unexplained blank page.
  const kidAllowedIds = useMemo(() => {
    if (isAdult) return null;
    const candidates = displaysForLocations(myDisplays, myLocationIds(locations, me.id));
    if (!candidates.length) return null;
    const ids = new Set<string>();
    candidates.forEach((d) => d.calendarIds.forEach((id) => ids.add(id)));
    return ids;
  }, [isAdult, locations, myDisplays, me.id]);

  const refreshShared = useCallback(async () => {
    const cals = await api.sharedCalendars();
    setShared(cals);
    const ids = cals.map((c) => c.id);
    setVisible(new Set(kidAllowedIds ? ids.filter((id) => kidAllowedIds.has(id)) : ids));
  }, [kidAllowedIds]);

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
      <Dashboard me={me} />
      <section>
        {isAdult ? (
          <>
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
          </>
        ) : (
          // Kids get no picker — just a read-only summary of what's showing,
          // auto-scoped to their location's display (see kidAllowedIds above).
          <h2 className="text-lg font-semibold">
            Calendars <span className="text-slate-400">({visible.size})</span>
          </h2>
        )}
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
    </div>
  );
}
