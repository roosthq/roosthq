import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  choreClient,
  loginUrl,
  ROLE_ICON,
  ROLE_LABEL,
  type Me,
  type Member,
  type GoogleCalendar,
  type SharedCalendar,
  type CalEvent,
  type Chore,
} from '../api';
import Calendar from '../Calendar';
import AddEventModal from '../AddEventModal';
import Modal from '../Modal';
import { useDialog } from '../Dialog';
import { myLocationIds, displaysForLocations } from '../displayScope';
import { projectChoreOccurrences, choreOccurrenceEvent, PERSON_COLORS, type ChoreOccurrence } from '../choreOccurrences';
import ChoreOccurrenceActions from '../ChoreOccurrenceActions';

export function Avatar({ name, src }: { name?: string; src?: string }) {
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
                <span className="block text-xs text-slate-400">{ROLE_ICON[m.role]} {ROLE_LABEL[m.role] ?? m.role}</span>
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
// Also reused in Settings (touch display calendar picker) — same shape there.
export function CalendarFilterDropdown({
  options,
  visible,
  onChange,
  label = 'Filter',
}: {
  options: SharedCalendar[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
  label?: string;
}) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
        {label} ({visible.size}/{options.length}) ▾
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

export default function CalendarPage({ me }: { me: Me }) {
  const isFamilyManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const isKid = me.role === 'KID';
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT'; // can connect/add calendars
  const { alert } = useDialog();
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addingEvent, setAddingEvent] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.members().then(setMembers).catch(() => undefined);
  }, []);

  const refreshChores = useCallback(() => {
    choreClient().chores().then(setChores).catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshChores();
  }, [refreshChores]);

  const personColor = useMemo(() => {
    const ids = [...selectedPeople].sort();
    return new Map(ids.map((id, i) => [id, PERSON_COLORS[i % PERSON_COLORS.length]]));
  }, [selectedPeople]);

  const choreOccurrences = useMemo(
    () => (range ? projectChoreOccurrences(chores, selectedPeople, new Date(range.start), new Date(range.end)) : []),
    [chores, selectedPeople, range],
  );

  const choreEventsById = useMemo(() => {
    const m = new Map<string, ChoreOccurrence>();
    const list: CalEvent[] = [];
    for (const occ of choreOccurrences) {
      const member = members.find((x) => x.id === occ.assigneeUserId);
      const ev = choreOccurrenceEvent(occ, personColor.get(occ.assigneeUserId) ?? '#94a3b8', member?.displayName ?? 'Someone', member?.avatar);
      m.set(ev.id, occ);
      list.push(ev);
    }
    return { map: m, list };
  }, [choreOccurrences, members, personColor]);

  // Checked proactively so a dead Google connection surfaces on page load —
  // not just as a mysteriously-empty calendar or a "Manage calendars" click
  // that quietly does nothing.
  useEffect(() => {
    if (!isAdult) return;
    api.googleAccountStatus().then((s) => setNeedsReconnect(s.needsReconnect)).catch(() => undefined);
  }, [isAdult]);

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
  const [scopeReady, setScopeReady] = useState(isFamilyManager);

  useEffect(() => {
    let cancelled = false;
    async function resolveScope() {
      if (isFamilyManager) {
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
  }, [isFamilyManager, isKid, me.id]);

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
    try {
      const cals = await api.googleCalendars();
      setPicker(cals);
      // Pre-check whatever I've already added, so the picker reflects reality
      // and unchecking one removes my share of it.
      setPicked(new Set(shared.filter((c) => c.sharedByMe && c.googleCalendarId).map((c) => c.googleCalendarId as string)));
    } catch {
      // Re-check status rather than assume — this could be any failure, but
      // if it's specifically a dead Google connection the banner should now
      // reflect that instead of the click just silently doing nothing.
      const s = await api.googleAccountStatus().catch(() => ({ needsReconnect: false }));
      setNeedsReconnect(s.needsReconnect);
      await alert(
        s.needsReconnect
          ? 'A connected Google account needs to be reconnected before calendars can be managed — see the banner above.'
          : "Couldn't load your Google calendars — try again in a moment.",
      );
    }
  }

  async function doShare() {
    if (!picker) return;
    const pickerIds = new Set(picker.map((c) => c.googleCalendarId));
    const alreadyMineIds = new Set(shared.filter((c) => c.sharedByMe && c.googleCalendarId).map((c) => c.googleCalendarId as string));

    const byAccount = new Map<string, GoogleCalendar[]>();
    for (const c of picker) {
      if (!picked.has(c.googleCalendarId) || alreadyMineIds.has(c.googleCalendarId)) continue;
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

    const toRemove = [...alreadyMineIds].filter((id) => pickerIds.has(id) && !picked.has(id));
    await Promise.all(toRemove.map((id) => api.unshare(id)));

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

      {needsReconnect && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="flex-1">
            A connected Google account's calendar access expired — its calendars and events won't show up until it's
            reconnected. Signing out and back in won't fix this by itself; it needs to go through Google's consent
            screen again.
          </span>
          <a
            href={`${loginUrl}?mode=self&reconnect=1`}
            className="shrink-0 rounded border border-amber-400 bg-white px-3 py-1.5 font-medium hover:bg-amber-100"
          >
            Reconnect Google account
          </a>
        </div>
      )}

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">
            Calendars <span className="text-slate-400">({visible.size}/{filterOptions.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {isAdult && (
              <>
                <a href={`${loginUrl}?mode=self`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  <span className="hidden sm:inline">+ Connect another of my Google accounts</span>
                  <span className="sm:hidden">+ Connect Google account</span>
                </a>
                <button onClick={openPicker} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  Manage calendars
                </button>
              </>
            )}
            {filterOptions.length > 0 && (
              <button
                onClick={() => {
                  setPrefillDate(null);
                  setAddingEvent(true);
                }}
                className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                + Add event
              </button>
            )}
            <CalendarFilterDropdown options={filterOptions} visible={visible} onChange={setVisible} />
            {members.length > 0 && (
              <details className="relative">
                <summary className="cursor-pointer list-none rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  Chores ({selectedPeople.size}/{members.length}) ▾
                </summary>
                <div className="absolute right-0 z-10 mt-1 max-h-72 w-56 overflow-auto rounded border bg-white p-2 shadow">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedPeople.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(selectedPeople);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          setSelectedPeople(next);
                        }}
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: personColor.get(m.id) ?? '#94a3b8' }} />
                      <span className="truncate">{m.displayName}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </section>

      <Calendar
        events={[...events, ...choreEventsById.list]}
        onRangeChange={onRangeChange}
        onAddEvent={
          filterOptions.length > 0
            ? (dateISO) => {
                setPrefillDate(dateISO);
                setAddingEvent(true);
              }
            : undefined
        }
        renderExtra={(e) => {
          const occ = choreEventsById.map.get(e.id);
          if (!occ) return null;
          return <ChoreOccurrenceActions chore={occ.chore} instance={occ.instance} me={me} onChanged={refreshChores} />;
        }}
      />

      {addingEvent && (
        <AddEventModal
          options={filterOptions}
          initialDate={prefillDate ?? undefined}
          onClose={() => setAddingEvent(false)}
          onCreate={async (calendarId, body) => {
            await api.createCalendarEvent(calendarId, body);
            setAddingEvent(false);
            refreshEvents();
          }}
        />
      )}

      {picker && (
        <Modal
          header={
            <>
              <h3 className="text-lg font-semibold">Add or remove calendars</h3>
              <p className="mt-1 text-xs text-slate-400">Checked = shared with the family. Uncheck one to remove it.</p>
            </>
          }
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setPicker(null)} className="rounded border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={doShare} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                Save changes
              </button>
            </div>
          }
        >
          <ul className="space-y-1">
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
        </Modal>
      )}
    </div>
  );
}
