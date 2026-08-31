import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  choreClient,
  loginUrl,
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
import { familyFeatureEnabled, kidPermissionEnabled } from '../api';
import ResponsiveDropdown from '../ResponsiveDropdown';
import AgendaPage from './AgendaPage';

export function Avatar({ name, src, size = 'md' }: { name?: string; src?: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  if (src) return <img src={src} alt={name ?? ''} className={`${cls} rounded-full object-cover`} />;
  return (
    <span className={`${cls} inline-flex items-center justify-center rounded-full bg-slate-300 font-semibold text-slate-700`}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

// Compact multi-select: a checkbox list tucked behind a summary toggle instead
// of a wall of pills. Used by every role - only the candidate `options` differ.
// Also reused in Settings (touch display calendar picker) - same shape there.
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
    <ResponsiveDropdown
      trigger={`${label} (${visible.size}/${options.length}) ▾`}
      triggerClassName="cursor-pointer list-none rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
      title={label}
      panelClassName="max-h-72 w-64 overflow-auto"
    >
      {options.map((c) => (
        <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
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
          {c.image ? (
            <img src={c.image} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
          )}
          <span className="break-words">{c.name}</span>
        </label>
      ))}
      {options.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No calendars available.</p>}
    </ResponsiveDropdown>
  );
}

export default function CalendarPage({ me }: { me: Me }) {
  const isFamilyManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const isKid = me.role === 'KID';
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT'; // can connect/add calendars
  // A kid can connect their own Google account and share/unshare from it too
  // - on by default, same as every other KID_PERMISSIONS entry; an adult can
  // turn it off (or back on) per kid in Family & PINs.
  const canManageCalendars = isAdult || (isKid && kidPermissionEnabled(me, 'calendarShare'));
  // Kids can add events unless an adult turned that permission off (server
  // enforces it in calendars/local-calendars createEvent).
  const canAddEvents = kidPermissionEnabled(me, 'calendarAdd');
  // Agenda folded in as a view mode (nav reorg, 2026-08) rather than its own
  // route - it's the same events+chores stream this page already fetches,
  // just rendered as a printable day-by-day list instead of a grid. The old
  // /agenda route redirects here with ?view=agenda so existing links/
  // bookmarks land on the right mode instead of just the default grid.
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'agenda'>(params.get('view') === 'agenda' ? 'agenda' : 'grid');
  // Keeps the URL in sync going forward too, not just on initial load - so
  // switching views is bookmarkable/shareable/back-button-friendly, same
  // convention as StorePage's tab switcher.
  function selectView(next: 'grid' | 'agenda') {
    setView(next);
    setParams(next === 'agenda' ? { view: 'agenda' } : {}, { replace: true });
  }
  const { alert } = useDialog();
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addingEvent, setAddingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [mealsEnabled, setMealsEnabled] = useState(false);
  const [choresEnabled, setChoresEnabled] = useState(true);
  useEffect(() => {
    api.familySettings().then((f) => {
      setMealsEnabled(familyFeatureEnabled(f, 'meals'));
      setChoresEnabled(familyFeatureEnabled(f, 'chores'));
    }).catch(() => undefined);
  }, []);
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

  // Same fix as Display.tsx's own allCalendarEvents - a fresh array on every
  // render here was breaking Calendar's own byDay/laneMap memoization
  // (keyed on referential equality of `events`), forcing it to redo the
  // full day-grouping/lane-allocation work on every render of this page,
  // not just when the actual events changed.
  const allCalendarEvents = useMemo(() => [...events, ...choreEventsById.list], [events, choreEventsById.list]);

  // Checked proactively so a dead Google connection surfaces on page load -
  // not just as a mysteriously-empty calendar or a "Manage calendars" click
  // that quietly does nothing.
  useEffect(() => {
    if (!canManageCalendars) return;
    api.googleAccountStatus().then((s) => setNeedsReconnect(s.needsReconnect)).catch(() => undefined);
  }, [canManageCalendars]);

  // "Manage calendars" (the share/unshare picker) only makes sense once
  // there's a connected Google account to pick FROM - without one it just
  // opened to an empty picker with nothing to do. The "+ Connect" button
  // stays up regardless; that's how you get your first one connected.
  const [hasGoogleAccount, setHasGoogleAccount] = useState(false);
  useEffect(() => {
    if (!canManageCalendars) return;
    api.listGoogleAccounts().then((accts) => setHasGoogleAccount(accts.length > 0)).catch(() => undefined);
  }, [canManageCalendars]);

  // Everyone still gets to filter - but non-owners only get to choose among a
  // location-scoped subset: adults see calendars shared by anyone at their own
  // location; kids see whatever's on their location's touch display. Owners see
  // (and can filter among) every shared family calendar.
  //
  // allowedIds/scopeReady are resolved together in one async pass (not derived
  // piecemeal from several independent fetches) specifically so there's no
  // window where "the location/display data hasn't loaded yet" is indistinguishable
  // from "this person has no restriction" - that gap used to let a kid's very
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
          // null calendarIds means that display is on "Automatic" (§16) -
          // resolve it to whatever's actually shared to ITS location, same
          // as the display itself would show, rather than assuming it's a
          // real array.
          const resolved = await Promise.all(
            candidates.map((d) => (d.calendarIds !== null ? Promise.resolve(d.calendarIds) : api.displaysCalendars(d.locationId).then((cs) => cs.map((c) => c.id)))),
          );
          resolved.forEach((calIds) => calIds.forEach((id) => ids.add(id)));
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
  // Holidays are visible/toggleable like any other calendar but aren't a
  // real writable calendar underneath - nothing to POST/PATCH/DELETE against
  // - so they're excluded from what "+ Add event" (and editing) offer.
  const addableOptions = useMemo(() => filterOptions.filter((c) => c.source !== 'holiday'), [filterOptions]);
  const addableCalendarIds = useMemo(() => new Set(addableOptions.map((c) => c.id)), [addableOptions]);

  const refreshShared = useCallback(async () => {
    if (!scopeReady) return; // don't reveal anything (even briefly) before scope is known
    // Location-scoped, not the unrestricted family-wide list (that one's for
    // the admin view on Family Settings > Calendars) - only calendars shared
    // by someone at a location I'm actually part of (or shared family-wide).
    // A person in no location gets the unrestricted list; there's nothing
    // sensible to scope by.
    const cals = await api.myCalendars();
    setShared(cals);
    const ids = cals.map((c) => c.id);
    setVisible(new Set(allowedIds ? ids.filter((id) => allowedIds.has(id)) : ids));
  }, [allowedIds, scopeReady]);

  useEffect(() => {
    refreshShared();
  }, [refreshShared]);

  // Keyed events cache, warmed by prefetching the adjacent page whenever the
  // range changes (see onRangeChange below) - swiping to a month/week
  // already visited (or already prefetched one page ahead) paints instantly
  // from here instead of always paying a fresh network round-trip. A ref,
  // not state: it's read-through storage, not something that should itself
  // trigger a render.
  const eventCache = useRef(new Map<string, CalEvent[]>());
  function cacheKey(ids: string[], start: string, end: string) {
    return `${[...ids].sort().join(',')}|${start}|${end}`;
  }

  const refreshEvents = useCallback(() => {
    if (!scopeReady || !range || visible.size === 0) {
      setEvents([]);
      return;
    }
    const ids = [...visible];
    const key = cacheKey(ids, range.start, range.end);
    const cached = eventCache.current.get(key);
    // Paint from cache immediately if we have it - the fetch below still
    // runs regardless, so a mutation-triggered refresh (add/edit/delete
    // event) always ends up showing genuinely fresh data, not a stale
    // cache hit; this just removes the visible gap while that happens.
    if (cached) setEvents(cached);
    api
      .events(ids, range.start, range.end)
      .then((fresh) => {
        // Unbounded growth guard - a long session paging through a year of
        // months would otherwise just keep accumulating entries forever.
        if (eventCache.current.size > 60) eventCache.current.clear();
        eventCache.current.set(key, fresh);
        setEvents(fresh);
      })
      .catch(() => {
        if (!cached) setEvents([]);
      });
  }, [scopeReady, visible, range]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  // Warms the cache for whichever page(s) Calendar.tsx expects to be
  // navigated to next (previous/next week/month) - fire-and-forget, and
  // skipped entirely for a range already cached.
  const prefetchRanges = useCallback(
    (ranges: { start: string; end: string }[]) => {
      if (!scopeReady || visible.size === 0) return;
      const ids = [...visible];
      for (const r of ranges) {
        const key = cacheKey(ids, r.start, r.end);
        if (eventCache.current.has(key)) continue;
        api
          .events(ids, r.start, r.end)
          .then((fresh) => {
            if (eventCache.current.size > 60) eventCache.current.clear();
            eventCache.current.set(key, fresh);
          })
          .catch(() => undefined);
      }
    },
    [scopeReady, visible],
  );

  const onRangeChange = useCallback(
    (start: string, end: string, prefetch?: { start: string; end: string }[]) => {
      setRange({ start, end });
      if (prefetch) prefetchRanges(prefetch);
    },
    [prefetchRanges],
  );

  async function openPicker() {
    try {
      const cals = await api.googleCalendars();
      setPicker(cals);
      // Pre-check whatever I've already added, so the picker reflects reality
      // and unchecking one removes my share of it.
      setPicked(new Set(shared.filter((c) => c.sharedByMe && c.googleCalendarId).map((c) => c.googleCalendarId as string)));
    } catch {
      // Re-check status rather than assume - this could be any failure, but
      // if it's specifically a dead Google connection the banner should now
      // reflect that instead of the click just silently doing nothing.
      const s = await api.googleAccountStatus().catch(() => ({ needsReconnect: false }));
      setNeedsReconnect(s.needsReconnect);
      await alert(
        s.needsReconnect
          ? 'A connected Google account needs to be reconnected before calendars can be managed - see the banner above.'
          : "Couldn't load your Google calendars - try again in a moment.",
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
        <p className="text-sm text-slate-400">Loading your calendar…</p>
      </div>
    );
  }

  return (
    <div>
      {needsReconnect && (
        <div className="alert-banner no-print mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="flex-1">
            A connected Google account's calendar access expired - its calendars and events won't show up until it's
            reconnected. Signing out and back in won't fix this by itself; it needs to go through Google's consent
            screen again.
          </span>
          <a
            href={`${loginUrl}?mode=self&reconnect=1`}
            className="shrink-0 rounded border px-3 py-1.5 font-medium hover:bg-slate-50"
          >
            Reconnect Google account
          </a>
        </div>
      )}

      <div className="no-print mb-4 flex rounded border p-0.5 text-sm" style={{ width: 'fit-content' }}>
        <button
          onClick={() => selectView('grid')}
          className={`rounded px-4 py-1.5 ${view === 'grid' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
        >
          Grid
        </button>
        <button
          onClick={() => selectView('agenda')}
          className={`rounded px-4 py-1.5 ${view === 'agenda' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
        >
          Agenda
        </button>
      </div>

      {view === 'agenda' ? (
        <AgendaPage />
      ) : (
        <>
      <section className="no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Calendars <span className="text-slate-400">({visible.size}/{filterOptions.length})</span>
          </h2>
          {addableOptions.length > 0 && canAddEvents && (
            <button
              onClick={() => {
                setPrefillDate(null);
                setAddingEvent(true);
              }}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              + Add event
            </button>
          )}
        </div>

        {/* Filters are a distinct, everyday concern (what shows on THIS
            view) from account setup below - kept as their own row so they
            read as one group, not lost in a flat button pile. */}
        <div className="mt-2 flex flex-wrap gap-2">
          <CalendarFilterDropdown options={filterOptions} visible={visible} onChange={setVisible} />
          {choresEnabled && members.length > 0 && (
            <ResponsiveDropdown
              trigger={`Chores (${selectedPeople.size}/${members.length}) ▾`}
              triggerClassName="cursor-pointer list-none rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
              title="Chores"
              panelClassName="max-h-72 w-56 overflow-auto"
            >
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
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
                  <span className="break-words">{m.displayName}</span>
                </label>
              ))}
            </ResponsiveDropdown>
          )}
        </div>

        {/* Account setup, not everyday use - demoted to plain bordered
            buttons (not the same filled bg-slate-800 as "+ Add event")
            so it doesn't visually compete with the action someone actually
            takes every day. All three of these used to be styled
            identically, with no way to tell "the thing I do constantly"
            apart from "the thing I do once when I first set this up". */}
        {canManageCalendars && (
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <a href={`${loginUrl}?mode=self`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              <span className="hidden sm:inline">+ Connect another of my Google accounts</span>
              <span className="sm:hidden">+ Connect Google account</span>
            </a>
            {hasGoogleAccount && (
              <button onClick={openPicker} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                Manage calendars
              </button>
            )}
          </div>
        )}
      </section>

      <Calendar
        events={allCalendarEvents}
        onRangeChange={onRangeChange}
        showPrint
        onAddEvent={
          addableOptions.length > 0 && canAddEvents
            ? (dateISO) => {
                setPrefillDate(dateISO);
                setAddingEvent(true);
              }
            : undefined
        }
        canEditEvent={(e) => addableCalendarIds.has(e.calendarId)}
        onEditEvent={(e) => setEditingEvent(e)}
        renderExtra={(e) => {
          const occ = choreEventsById.map.get(e.id);
          if (!occ) return null;
          return <ChoreOccurrenceActions chore={occ.chore} instance={occ.instance} me={me} onChanged={refreshChores} />;
        }}
      />
        </>
      )}

      {(addingEvent || editingEvent) && (
        <AddEventModal
          options={addableOptions}
          initialDate={prefillDate ?? undefined}
          existing={editingEvent ?? undefined}
          showMeal={mealsEnabled}
          canEditMeal={isAdult}
          onClose={() => {
            setAddingEvent(false);
            setEditingEvent(null);
          }}
          onCreate={async (calendarId, body) => {
            await api.createCalendarEvent(calendarId, body);
            setAddingEvent(false);
            refreshEvents();
          }}
          onUpdate={async (calendarId, eventId, body) => {
            await api.updateCalendarEvent(calendarId, eventId, body);
            setEditingEvent(null);
            refreshEvents();
          }}
          onDelete={async (calendarId, eventId) => {
            await api.deleteCalendarEvent(calendarId, eventId);
            setEditingEvent(null);
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
