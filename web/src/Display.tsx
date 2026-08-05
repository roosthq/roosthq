import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  BASE_URL,
  choreClient,
  prizeClient,
  type CalEvent,
  type Chore,
  type ResolvedDisplayConfig,
  type Member,
  type SharedCalendar,
  type UnlockResult,
} from './api';
import Calendar from './Calendar';
import ChoresPanel from './ChoresPanel';
import PrizesPanel from './PrizesPanel';
import KioskAccountPanel from './KioskAccountPanel';
import AddEventModal from './AddEventModal';
import ChoreOccurrenceActions from './ChoreOccurrenceActions';
import { projectChoreOccurrences, choreOccurrenceEvent, PERSON_COLORS } from './choreOccurrences';
import Logo from './Logo';
import { AwardForm } from './pages/AwardsPage';
import { PrizeForm } from './pages/StorePage';
import OnScreenKeyboard from './OnScreenKeyboard';
import Screensaver from './Screensaver';
import { useWeather } from './useWeather';
import { dget, dpost, displayToken as token } from './displayApi';

function Avatar({ name, src, big }: { name?: string; src?: string; big?: boolean }) {
  const cls = big ? 'h-14 w-14 text-xl' : 'h-8 w-8 text-sm';
  if (src) return <img src={src} alt={name ?? ''} className={`${cls} rounded-full object-cover`} />;
  return (
    <span className={`${cls} inline-flex items-center justify-center rounded-full bg-slate-300 font-semibold text-slate-700`}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

export default function Display() {
  const [config, setConfig] = useState<ResolvedDisplayConfig | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [active, setActive] = useState<UnlockResult | null>(null);
  // Keyed on the token string (not `active`) so this stays referentially stable
  // across re-renders instead of feeding ChoresPanel a new client every time.
  const kioskChoreClient = useMemo(() => (active ? choreClient(active.token) : undefined), [active?.token]);
  const kioskPrizeClient = useMemo(() => (active ? prizeClient(active.token) : undefined), [active?.token]);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [calendarOptions, setCalendarOptions] = useState<SharedCalendar[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [addingAward, setAddingAward] = useState(false);
  const [addingPrize, setAddingPrize] = useState(false);
  const [tokenValueUsd, setTokenValueUsd] = useState(1);
  const [chores, setChores] = useState<Chore[]>([]);
  // Bumped on any incoming chores/prizes/tokens live-update push — passed down
  // to ChoresPanel/PrizesPanel so they refetch immediately instead of only on
  // mount. refreshEvents isn't declared yet at this point in the component, so
  // it's read through a ref (populated by an effect further down) rather than
  // closed over directly, the same way `activeRef` sidesteps the same issue.
  const [dataRefreshSignal, setDataRefreshSignal] = useState(0);
  const refreshEventsRef = useRef<() => void>(() => undefined);

  // Full-screen clock after N idle minutes (DisplayConfig.screensaverMinutes,
  // 0 = disabled) — any touch/mouse/key activity resets the timer, including
  // the tap that dismisses the screensaver itself (it's a real DOM event
  // bubbling to document, not just Screensaver's onDismiss).
  const [screensaverOn, setScreensaverOn] = useState(false);
  useEffect(() => {
    const minutes = config?.screensaverMinutes ?? 0;
    if (!minutes) {
      setScreensaverOn(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setScreensaverOn(false);
      clearTimeout(timer);
      timer = setTimeout(() => setScreensaverOn(true), minutes * 60_000);
    };
    const events: Array<keyof DocumentEventMap> = ['touchstart', 'mousedown', 'keydown', 'wheel'];
    events.forEach((e) => document.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, reset));
    };
  }, [config?.screensaverMinutes]);

  const isAdult = active ? ['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(active.user.role) : false;

  // Shared with Screensaver.tsx (passed down as a prop) so both show the same
  // reading on the same 15-minute schedule instead of polling independently.
  const weather = useWeather(config?.weatherLocation);

  useEffect(() => {
    if (!kioskPrizeClient) return;
    kioskPrizeClient.familySettings().then((s) => setTokenValueUsd(s.tokenValueUsd)).catch(() => undefined);
  }, [kioskPrizeClient]);

  const refreshChores = useCallback(() => {
    if (!kioskChoreClient) {
      setChores([]);
      return;
    }
    kioskChoreClient.chores().then(setChores).catch(() => setChores([]));
  }, [kioskChoreClient]);
  useEffect(() => {
    refreshChores();
  }, [refreshChores]);

  // The signed-in person's own chores, current + projected future, plotted
  // onto the same calendar grid as everyone's events — same feature as the
  // main portal's "Chores" person-picker, just always scoped to whoever's
  // signed into this kiosk profile instead of an opt-in multi-select.
  const choreEventsById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof projectChoreOccurrences>[number]>();
    const list: CalEvent[] = [];
    if (active && range) {
      const occs = projectChoreOccurrences(chores, new Set([active.user.id]), new Date(range.start), new Date(range.end));
      for (const occ of occs) {
        const ev = choreOccurrenceEvent(occ, PERSON_COLORS[0], active.user.displayName);
        m.set(ev.id, occ);
        list.push(ev);
      }
    }
    return { map: m, list };
  }, [active, chores, range]);

  // Which pane is the main focus — persisted across reloads (the kiosk stays
  // powered on for weeks; a refresh shouldn't quietly reset it back).
  const [layout, setLayout] = useState<'calendar' | 'person'>(
    () => (localStorage.getItem('rhq-kiosk-layout') as 'calendar' | 'person') || 'calendar',
  );
  useEffect(() => {
    localStorage.setItem('rhq-kiosk-layout', layout);
  }, [layout]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => undefined);
  }

  // Tracked in a ref (not state) so loadConfig's identity stays stable across
  // unlock/lock — it's a dependency of the mount effect that opens the SSE
  // stream, and that stream shouldn't reconnect every time a profile switches.
  const activeRef = useRef<UnlockResult | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // The display's own light/dark mode (data-mode) — a property of the
  // physical kiosk, never overridden by whoever's signed in (see unlock()
  // below). data-theme (the color hue) resets to the brand default here and
  // is the only thing a signed-in profile's own preference changes.
  const applyIdleTheme = useCallback((c: ResolvedDisplayConfig) => {
    document.documentElement.setAttribute('data-mode', c.theme === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', 'meadow');
    document.documentElement.setAttribute('data-font-size', ['sm', 'lg', 'xl'].includes(c.fontSize) ? c.fontSize : 'md');
  }, []);

  const loadConfig = useCallback(async () => {
    const c = await dget<ResolvedDisplayConfig>('/display/config');
    setConfig(c);
    if (!activeRef.current) applyIdleTheme(c);
  }, [applyIdleTheme]);

  // Re-fetched whenever the profile picker is shown again (see "Switch / lock"
  // below), not just once at mount — otherwise a PIN set mid-session keeps
  // showing as absent (no 🔒 badge) and picking that profile again skips
  // straight to unlock() with no PIN entered, which then just fails silently.
  const loadMembers = useCallback(() => {
    dget<Member[]>('/display/members').then(setMembers).catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    loadConfig().catch(() => setError('This display link is invalid or was revoked. Ask the family owner for a new one.'));
    loadMembers();

    // Chore/prize/token/calendar mutations elsewhere (another device, or the
    // scheduled miss-sweep) push a typed event here so this kiosk reflects
    // them immediately instead of only on next reload. Config changes (the
    // legacy/untyped case too, for anything published before this existed)
    // fall through to loadConfig — the safest catch-all.
    const streamUrl = `${BASE_URL}/display/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(streamUrl, { withCredentials: true });
    es.onmessage = (e) => {
      let type = 'display';
      try {
        type = JSON.parse(e.data)?.type ?? 'display';
      } catch {
        // legacy/untyped payload — treat as a config change
      }
      if (type === 'calendar') {
        refreshEventsRef.current();
      } else if (type === 'chores' || type === 'prizes' || type === 'tokens') {
        refreshChores();
        setDataRefreshSignal((n) => n + 1);
      } else {
        loadConfig().catch(() => undefined);
      }
    };
    return () => es.close();
  }, [loadConfig, loadMembers, refreshChores]);

  const refreshEvents = useCallback(() => {
    if (!range) return;
    dget<CalEvent[]>('/display/events', { start: range.start, end: range.end })
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [range]);

  useEffect(() => {
    refreshEventsRef.current = refreshEvents;
  }, [refreshEvents]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents, config]);

  // Calendar picker for "+ Add event": scoped to this display's own configured
  // calendars (config.calendarIds), fetched as the signed-in kiosk profile so
  // the same access check the server enforces on write also drives the list.
  useEffect(() => {
    if (!active || !config) {
      setCalendarOptions([]);
      return;
    }
    api
      .sharedCalendars(active.token)
      .then((all) => setCalendarOptions(all.filter((c) => config.calendarIds.includes(c.id))))
      .catch(() => setCalendarOptions([]));
  }, [active, config]);

  const onRangeChange = useCallback((s: string, e: string) => setRange({ start: s, end: e }), []);

  function selectProfile(m: Member) {
    if (m.hasPin || m.role !== 'KID') {
      setPinFor(m);
      setPin('');
      setPinError(null);
    } else {
      unlock(m);
    }
  }

  async function unlock(m: Member, enteredPin?: string) {
    try {
      const result = await dpost<UnlockResult>('/display/unlock', { userId: m.id, pin: enteredPin });
      setActive(result);
      // Light/dark stays the kiosk's own setting (config.theme, applied by
      // applyIdleTheme) — it's a property of the physical display, not the
      // person. Only the color hue follows whoever's signed in.
      document.documentElement.setAttribute('data-theme', result.user.colorTheme || 'meadow');
      setPinFor(null);
      setPin('');
      setPinError(null);
    } catch {
      // If this came from the no-PIN-prompt path (a stale "no PIN" flag) the
      // dialog was never open — open it now instead of failing invisibly.
      setPinFor(m);
      setPin('');
      setPinError('Wrong PIN — try again.');
    }
  }

  if (error)
    return <div className="flex min-h-screen items-center justify-center p-10 text-center text-slate-500">{error}</div>;
  if (!config)
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading display…</div>;

  const showCalendar = config.enabledFeatures.includes('calendar');
  const showChores = config.enabledFeatures.includes('chores');
  const showPrizes = config.enabledFeatures.includes('prizes');
  const personFocused = !!active && layout === 'person' && showCalendar && (showChores || showPrizes);

  return (
    <div className="flex h-screen flex-col overflow-hidden p-4">
      <header className="flex shrink-0 items-center justify-between border-b pb-3">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          {config.name && config.name !== 'Display' && (
            <span className="text-xl text-slate-400">· {config.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl text-slate-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          {weather && (
            <span className="text-lg text-slate-400" title={weather.label}>
              {weather.icon} {weather.tempF}°F
            </span>
          )}
          {active && showCalendar && calendarOptions.length > 0 && (
            <button
              onClick={() => setAddingEvent(true)}
              className="rounded border px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              + Add event
            </button>
          )}
          {active && isAdult && (
            <button
              onClick={() => setAddingAward(true)}
              className="rounded border px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              + Add award
            </button>
          )}
          {active && isAdult && showPrizes && (
            <button
              onClick={() => setAddingPrize(true)}
              className="rounded border px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              + Add prize
            </button>
          )}
          {active && showCalendar && (showChores || showPrizes) && (
            <div className="flex rounded border p-0.5 text-sm text-slate-500">
              <button
                onClick={() => setLayout('calendar')}
                title="Calendar-focused"
                className={`rounded px-2 py-1 ${layout === 'calendar' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
              >
                📅 Calendar
              </button>
              <button
                onClick={() => setLayout('person')}
                title="Person-focused"
                className={`rounded px-2 py-1 ${layout === 'person' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
              >
                🙂 {active.user.displayName.split(' ')[0]}
              </button>
            </div>
          )}
          <button
            onClick={() => setScreensaverOn(true)}
            title="Screensaver"
            className="rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            🌙
          </button>
          <button
            onClick={() => window.location.reload()}
            title="Refresh"
            className="rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ⟳
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            className="rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {isFullscreen ? '⤡' : '⛶'}
          </button>
        </div>
      </header>

      {/* Calendar (left, fills all remaining height) and a fixed-width right
          panel that always occupies the same place: the profile picker before
          sign-in, the signed-in person's chores after. In person-focused
          layout the two swap proportions — calendar shrinks to a small
          "windows-style" side widget (dots only) and the person's own stuff
          becomes the main event — but neither one's actual functionality
          changes: same Calendar component, same click-through day modal. */}
      <div className="mt-3 flex min-h-0 flex-1 gap-6">
        {showCalendar && (
          <div className={personFocused ? 'h-full w-72 shrink-0' : 'h-full min-w-0 flex-1'}>
            <Calendar
              events={[...events, ...choreEventsById.list]}
              onRangeChange={onRangeChange}
              size={!active ? 'normal' : personFocused ? 'mini' : 'compact'}
              fill
              renderExtra={(e) => {
                const occ = choreEventsById.map.get(e.id);
                if (!occ || !active) return null;
                return (
                  <ChoreOccurrenceActions
                    chore={occ.chore}
                    instance={occ.instance}
                    me={active.user}
                    token={active.token}
                    onChanged={refreshChores}
                  />
                );
              }}
            />
          </div>
        )}

        {(showChores || showPrizes) && (
          <aside className={personFocused ? 'flex h-full flex-1 flex-col' : 'flex h-full w-80 shrink-0 flex-col'}>
            {active ? (
              <>
                <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                  <Avatar name={active.user.displayName} src={active.user.avatar} />
                  <span className="min-w-0 truncate font-medium">{active.user.displayName}</span>
                  <button
                    onClick={() => {
                      setActive(null);
                      loadMembers();
                      applyIdleTheme(config);
                    }}
                    className="ml-auto shrink-0 rounded border px-2 py-1 text-xs hover:bg-white"
                  >
                    Switch / lock
                  </button>
                </div>
                <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {showChores && (
                    <ChoresPanel
                      me={active.user}
                      client={kioskChoreClient}
                      variant="today"
                      locationId={config.locationId}
                      refreshSignal={dataRefreshSignal}
                    />
                  )}
                  {showPrizes && <PrizesPanel me={active.user} client={kioskPrizeClient} refreshSignal={dataRefreshSignal} />}
                  <KioskAccountPanel
                    me={active.user}
                    client={kioskPrizeClient}
                    onPinChanged={loadMembers}
                    onColorThemeChanged={(c) => document.documentElement.setAttribute('data-theme', c)}
                  />
                </div>
              </>
            ) : (
              <>
                <span className="shrink-0 text-sm text-slate-500">Tap your photo:</span>
                <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => selectProfile(m)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100"
                    >
                      <Avatar name={m.displayName} src={m.avatar} big />
                      <span className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.displayName}</div>
                        {/* Reserve this line's height for every row, PIN or not, so rows stay aligned. */}
                        <div className="h-[14px] text-[10px] text-slate-400">
                          {(m.hasPin || m.role !== 'KID') ? '🔒 PIN' : ''}
                        </div>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {addingEvent && active && (
        <AddEventModal
          options={calendarOptions}
          onClose={() => setAddingEvent(false)}
          onCreate={async (calendarId, body) => {
            await api.createCalendarEvent(calendarId, body, active.token);
            setAddingEvent(false);
            refreshEvents();
          }}
        />
      )}

      {addingAward && active && (
        <AwardForm award={null} kioskToken={active.token} onClose={() => setAddingAward(false)} onSaved={() => setAddingAward(false)} />
      )}

      {addingPrize && active && (
        <PrizeForm
          prize={null}
          members={members}
          tokenValueUsd={tokenValueUsd}
          kioskToken={active.token}
          onClose={() => setAddingPrize(false)}
          onSaved={() => setAddingPrize(false)}
        />
      )}

      <OnScreenKeyboard enabled={!!config.onScreenKeyboard} />

      {screensaverOn && <Screensaver weather={weather} onDismiss={() => setScreensaverOn(false)} />}

      {pinFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg bg-white p-6 text-center">
            <Avatar name={pinFor.displayName} src={pinFor.avatar} big />
            <h3 className="mt-2 text-lg font-semibold">{pinFor.displayName}</h3>
            <p className="text-sm text-slate-500">Enter PIN</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlock(pinFor, pin)}
              className="mt-3 w-full rounded border px-3 py-2 text-center text-2xl tracking-widest"
            />
            {pinError && <p className="mt-2 text-sm text-red-500">{pinError}</p>}
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setPinFor(null)} className="rounded border px-4 py-1.5 text-sm">
                Cancel
              </button>
              <button
                onClick={() => unlock(pinFor, pin)}
                className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
