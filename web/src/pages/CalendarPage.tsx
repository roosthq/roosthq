import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, loginUrl, type Me, type Member, type GoogleCalendar, type SharedCalendar, type CalEvent } from '../api';
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
  const [tokenIcon, setTokenIcon] = useState('🪙');

  useEffect(() => {
    api.members().then(setMembers).catch(() => setMembers([]));
    api.tokenBalances().then((b) => setBalances(Object.fromEntries(b.map((x) => [x.userId, x.balance])))).catch(() => undefined);
    api.familySettings().then((f) => {
      setTokenName(f.tokenName);
      setTokenIcon(f.tokenIcon);
    }).catch(() => undefined);
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
                {tokenIcon} {balances[m.id] ?? 0}
                <span className="ml-1 text-xs font-normal text-slate-400">{tokenName}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Compact multi-select: a checkbox list tucked behind a summary toggle instead
// of a wall of pills. Used by every role — only the candidate `options` differ.
function CalendarFilterDropdown({
  options,
  visible,
  onChange,
}: {
  options: SharedCalendar[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
        Filter ({visible.size}/{options.length}) ▾
      </summary>
      <div className="absolute right-0 z-10 mt-1 max-h-72 w-64 overflow-auto rounded border bg-white p-2 shadow">
        {options.map((c) => (
          <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              checked={visible.has(c.id)}
              onChange={(e) => {
                const next = new Set(visible);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                onChange(next);
              }}
            />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
            <span className="truncate">{c.name}</span>
          </label>
        ))}
        {options.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No calendars available.</p>}
      </div>
    </details>
  );
}

// Add an event to any calendar the signed-in person already has access to
// (the same `filterOptions` list used for filtering) — attribution is stamped
// server-side from the session, not passed in here.
function AddEventModal({
  options,
  onClose,
  onCreate,
}: {
  options: SharedCalendar[];
  onClose: () => void;
  onCreate: (calendarId: string, body: { summary: string; start: { date: string }; end: { date: string }; location?: string; description?: string }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [calendarId, setCalendarId] = useState(options[0]?.id ?? '');
  const [summary, setSummary] = useState('');
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!calendarId || !summary.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onCreate(calendarId, {
        summary: summary.trim(),
        start: { date },
        end: { date },
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      });
    } catch {
      setErr('Could not add the event — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <h3 className="text-lg font-semibold">Add event</h3>
        <div className="mt-3 space-y-2 text-sm">
          <label className="block">
            <span className="text-slate-500">Calendar</span>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
            >
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-slate-500">Title</span>
            <input
              autoFocus
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
              placeholder="e.g. Dentist appointment"
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Location (optional)</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Notes (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={2}
            />
          </label>
          {err && <p className="text-red-500">{err}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !calendarId || !summary.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add event'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const isKid = me.role === 'KID';
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT'; // can connect/add calendars
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addingEvent, setAddingEvent] = useState(false);

  // Everyone still gets to filter — but non-owners only get to choose among a
  // location-scoped subset: adults see calendars shared by anyone at their own
  // location; kids see whatever's on their location's touch display. Owners see
  // (and can filter among) every shared family calendar.
  //
  // allowedIds/scopeReady are resolved together in one async pass (not derived
  // piecemeal from several independent fetches) specifically so there's no
  // window where "the location/display data hasn't loaded yet" is indistinguishable
  // from "this person has no restriction" — that gap used to let a kid's very
  // first render show (and fetch events for) every family calendar, including
  // ones they don't have access to, before narrowing a moment later.
  const [allowedIds, setAllowedIds] = useState<Set<string> | null>(null);
  const [scopeReady, setScopeReady] = useState(isOwner);

  useEffect(() => {
    let cancelled = false;
    async function resolveScope() {
      if (isOwner) {
        setAllowedIds(null);
        setScopeReady(true);
        return;
      }
      try {
        const locs = await api.locations();
        const locIds = myLocationIds(locs, me.id);
        if (isKid) {
          const disps = await api.listDisplays();
          const candidates = displaysForLocations(disps, locIds);
          const ids = new Set<string>();
          candidates.forEach((d) => d.calendarIds.forEach((id) => ids.add(id)));
          if (!cancelled) setAllowedIds(candidates.length ? ids : null);
        } else {
          if (!locIds.length) {
            if (!cancelled) setAllowedIds(null);
          } else {
            const lists = await Promise.all(locIds.map((id) => api.displaysCalendars(id)));
            const ids = new Set(lists.flat().map((c) => c.id));
            if (!cancelled) setAllowedIds(ids.size ? ids : null);
          }
        }
      } catch {
        if (!cancelled) setAllowedIds(null);
      } finally {
        if (!cancelled) setScopeReady(true);
      }
    }
    resolveScope();
    return () => {
      cancelled = true;
    };
  }, [isOwner, isKid, me.id]);

  const filterOptions = useMemo(
    () => (allowedIds ? shared.filter((c) => allowedIds.has(c.id)) : shared),
    [allowedIds, shared],
  );

  const refreshShared = useCallback(async () => {
    if (!scopeReady) return; // don't reveal anything (even briefly) before scope is known
    const cals = await api.sharedCalendars();
    setShared(cals);
    const ids = cals.map((c) => c.id);
    setVisible(new Set(allowedIds ? ids.filter((id) => allowedIds.has(id)) : ids));
  }, [allowedIds, scopeReady]);

  useEffect(() => {
    refreshShared();
  }, [refreshShared]);

  const refreshEvents = useCallback(() => {
    if (!scopeReady || !range || visible.size === 0) {
      setEvents([]);
      return;
    }
    api.events([...visible], range.start, range.end).then(setEvents).catch(() => setEvents([]));
  }, [scopeReady, visible, range]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

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

  if (!scopeReady) {
    return (
      <div>
        <Dashboard me={me} />
        <p className="text-sm text-slate-400">Loading your calendar…</p>
      </div>
    );
  }

  return (
    <div>
      <Dashboard me={me} />
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Calendars <span className="text-slate-400">({visible.size}/{filterOptions.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            {isAdult && (
              <>
                <a href={`${loginUrl}?mode=self`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  + Connect another of my Google accounts
                </a>
                <button onClick={openPicker} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  + Add calendars
                </button>
              </>
            )}
            {filterOptions.length > 0 && (
              <button onClick={() => setAddingEvent(true)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                + Add event
              </button>
            )}
            <CalendarFilterDropdown options={filterOptions} visible={visible} onChange={setVisible} />
          </div>
        </div>
      </section>

      <Calendar events={events} onRangeChange={onRangeChange} />

      {addingEvent && (
        <AddEventModal
          options={filterOptions}
          onClose={() => setAddingEvent(false)}
          onCreate={async (calendarId, body) => {
            await api.createCalendarEvent(calendarId, body);
            setAddingEvent(false);
            refreshEvents();
          }}
        />
      )}

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
