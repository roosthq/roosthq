import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  BASE_URL,
  choreClient,
  prizeClient,
  ROLE_ICON,
  ROLE_SLOT,
  familyFeatureEnabled,
  type CalEvent,
  type FamilySettings,
  type Chore,
  type ResolvedDisplayConfig,
  type Member,
  type SharedCalendar,
  type UnlockResult,
  type Balance,
  type AwardCatalogItem,
} from './api';
import { formatDate } from './dateFormat';
import LevelBadge from './LevelBadge';
import LucideIcon from './LucideIcon';
import Calendar from './Calendar';
import { celebrate, setCelebrationSound } from './celebrate';
import { setTokensBadgeEnabled } from './TokenBadge';
import { setSoundAssignments, type SoundAssignment } from './sounds';
import ChoresPanel from './ChoresPanel';
import PrizesPanel from './PrizesPanel';
import KioskAccountPanel from './KioskAccountPanel';
import AddEventModal from './AddEventModal';
import ChoreOccurrenceActions from './ChoreOccurrenceActions';
import { projectChoreOccurrences, choreOccurrenceEvent, PERSON_COLORS } from './choreOccurrences';
import Logo from './Logo';
import { AwardForm, AwardIcon, GrantModal } from './pages/AwardsPage';
import { PrizeForm } from './pages/StorePage';
import OnScreenKeyboard from './OnScreenKeyboard';
import Screensaver from './Screensaver';
import PendingPanel from './PendingPanel';
import TokenAdjustModal from './TokenAdjustModal';
import DinnerWeekModal from './DinnerWeekModal';
import KioskStatsModal from './KioskStatsModal';
import RulesPage from './pages/RulesPage';
import Modal from './Modal';
import { parseLocalDate, useWeather } from './useWeather';
import { dget, dpost, dpatch, displayToken as token } from './displayApi';
import DropdownDetails from './DropdownDetails';

// A plain window.location.reload() is a NAVIGATION, not a guaranteed fresh
// fetch - the browser (and, worse, Cloudflare's edge in front of the tunnel)
// can serve it straight from cache under that exact URL. A kiosk that's been
// sitting on the same URL for weeks then "reload"s into the very cached copy
// it's trying to get away from - reported live: a Pi kiosk kept showing a
// pre-fix build even after both the in-app Refresh button and a full device
// restart. Appending a fresh cache-busting query param makes this a genuinely
// new URL neither the browser nor any upstream cache has ever seen before,
// forcing a real network fetch regardless of what any Cache-Control header
// says - existing params (display=1, config, token) are preserved.
function hardReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('_r', Date.now().toString());
  window.location.href = url.toString();
}

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

  // Hiding the cursor should only ever happen on the real touchscreen, never
  // when previewing ?display=1 from a normal mouse-driven desktop/laptop -
  // see index.css's own note on .kiosk-mode. That used to be a
  // @media (hover: none) and (pointer: coarse) CSS gate, which is the
  // textbook-correct way to ask this - except this specific Linux/Chromium
  // build reports (pointer: coarse) as false and (hover: hover) as true even
  // on the kiosk's own real touchscreen (confirmed live via CDP against the
  // actual device: matchMedia said mouse, navigator.maxTouchPoints correctly
  // said 10). The media feature is unreliable here; maxTouchPoints isn't -
  // checking that in JS instead and driving the cursor rule off a class
  // instead of a media query.
  useEffect(() => {
    if (navigator.maxTouchPoints > 0) document.documentElement.classList.add('touch-device');
  }, []);

  const [members, setMembers] = useState<Member[]>([]);
  // Family-wide balances for the idle profile picker - display-token-scoped
  // (DisplayController.balances), no signed-in profile needed, same as
  // `members` itself right below.
  const [pickerBalances, setPickerBalances] = useState<Balance[]>([]);
  const [active, setActive] = useState<UnlockResult | null>(null);
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  // Keyed on the token string (not `active`) so this stays referentially stable
  // across re-renders instead of feeding ChoresPanel a new client every time.
  const kioskChoreClient = useMemo(() => (active ? choreClient(active.token) : undefined), [active?.token]);
  const kioskPrizeClient = useMemo(() => (active ? prizeClient(active.token) : undefined), [active?.token]);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [calendarOptions, setCalendarOptions] = useState<SharedCalendar[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [addingAward, setAddingAward] = useState(false);
  const [awardPickerOpen, setAwardPickerOpen] = useState(false);
  const [awardsCatalog, setAwardsCatalog] = useState<AwardCatalogItem[]>([]);
  const [grantingAward, setGrantingAward] = useState<AwardCatalogItem | null>(null);
  const [addingPrize, setAddingPrize] = useState(false);
  const [addingTokenAdjust, setAddingTokenAdjust] = useState(false);
  const [dinnerWeekOpen, setDinnerWeekOpen] = useState(false);
  const [revealedCountdowns, setRevealedCountdowns] = useState<Set<string>>(new Set());
  const [kioskRulesOpen, setKioskRulesOpen] = useState(false);
  const [kioskStatsOpen, setKioskStatsOpen] = useState(false);
  const [tokenValueUsd, setTokenValueUsd] = useState(1);
  const [tokenName, setTokenName] = useState('Tokens');
  const [tokenIcon, setTokenIcon] = useState('coins'); // Lucide name - see App.tsx tokenIcon comment
  const [chores, setChores] = useState<Chore[]>([]);
  // Bumped on any incoming chores/prizes/tokens live-update push - passed down
  // to ChoresPanel/PrizesPanel so they refetch immediately instead of only on
  // mount. refreshEvents isn't declared yet at this point in the component, so
  // it's read through a ref (populated by an effect further down) rather than
  // closed over directly, the same way `activeRef` sidesteps the same issue.
  const [dataRefreshSignal, setDataRefreshSignal] = useState(0);
  const refreshEventsRef = useRef<() => void>(() => undefined);
  // Forces a signed-in adult/family-manager/owner back to the idle picker
  // whenever the screensaver comes up (idle timeout or the manual button) -
  // a kid tapping the screen awake should never land in an adult's still-
  // signed-in session. Kids stay signed in; only adult+ gets kicked. Reads
  // through a ref (populated by an effect further down, after activeRef/
  // applyIdleTheme/loadMembers exist) so this can be called from the
  // idle-timer effect above, which is declared earlier in the component.
  const lockIfAdultRef = useRef<() => void>(() => undefined);

  // Full-screen clock after N idle minutes (DisplayConfig.screensaverMinutes,
  // 0 = disabled). This effect only ever *arms* the screensaver - it never
  // turns it off. Turning it off is Screensaver's own onClick's job alone
  // (see onDismiss below). Reason: touchstart/mousedown fire on the SAME tap
  // that dismisses the overlay, before the click that actually does the
  // dismissing - if this reschedule function also called
  // setScreensaverOn(false) synchronously on that touchstart, the overlay
  // would unmount mid-gesture and the browser's synthesized click (which
  // follows touchend) would re-hit-test and land on whatever's now
  // underneath instead of being absorbed by the overlay. Rescheduling the
  // *next* idle timeout on every activity event is still correct and safe
  // here - it just must not touch the current on/off state.
  const [screensaverOn, setScreensaverOn] = useState(false);
  useEffect(() => {
    const minutes = config?.screensaverMinutes ?? 0;
    if (!minutes) return;
    let timer: ReturnType<typeof setTimeout>;
    const reschedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lockIfAdultRef.current();
        setScreensaverOn(true);
      }, minutes * 60_000);
    };
    const events: Array<keyof DocumentEventMap> = ['touchstart', 'mousedown', 'keydown', 'wheel'];
    events.forEach((e) => document.addEventListener(e, reschedule));
    reschedule();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, reschedule));
    };
  }, [config?.screensaverMinutes]);

  // If the setting gets turned off entirely (0) while the screensaver is up,
  // still let it go dark - separate from the effect above so that one can
  // stay "arm only", never "turn off".
  useEffect(() => {
    if (!config?.screensaverMinutes) setScreensaverOn(false);
  }, [config?.screensaverMinutes]);

  const isAdult = active ? ['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(active.user.role) : false;

  // Shared with Screensaver.tsx (passed down as a prop) so both show the same
  // reading on the same 15-minute schedule instead of polling independently.
  const weather = useWeather(config?.weatherLocation);
  const [showForecast, setShowForecast] = useState(false);

  // Header clock - the date next to it was previously a one-shot
  // `new Date()` at render time, which never advances on its own since
  // nothing else re-renders this component every minute.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!kioskPrizeClient) return;
    kioskPrizeClient.familySettings().then((s) => {
      setTokenValueUsd(s.tokenValueUsd);
      setTokenName(s.tokenName);
      setTokenIcon(s.tokenIcon);
    }).catch(() => undefined);
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
  // onto the same calendar grid as everyone's events - same feature as the
  // main portal's "Chores" person-picker, just always scoped to whoever's
  // signed into this kiosk profile instead of an opt-in multi-select.
  const choreEventsById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof projectChoreOccurrences>[number]>();
    const list: CalEvent[] = [];
    if (active && range) {
      const occs = projectChoreOccurrences(chores, new Set([active.user.id]), new Date(range.start), new Date(range.end));
      for (const occ of occs) {
        const ev = choreOccurrenceEvent(occ, PERSON_COLORS[0], active.user.displayName, active.user.avatar);
        m.set(ev.id, occ);
        list.push(ev);
      }
    }
    return { map: m, list };
  }, [active, chores, range]);

  // A new array every render (`[...events, ...choreEventsById.list]` inline
  // at the Calendar call site below) breaks Calendar's OWN memoization of
  // this same data - its byDay/laneMap useMemos are keyed on referential
  // equality of `events`, so a fresh array reference on every Display
  // render (which happens often - any state change anywhere in this large
  // component) was forcing the full day-grouping/multi-day-lane-allocation
  // algorithm to rerun even when nothing about the actual events had
  // changed. Measured live on the kiosk: a couple hundred ms of main-thread
  // stall right on layout-toggle click, matching this exactly. Memoized so
  // the reference only changes when the underlying data actually does.
  const allCalendarEvents = useMemo(() => [...events, ...choreEventsById.list], [events, choreEventsById.list]);

  // Which pane is the main focus - persisted across reloads (the kiosk stays
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

  // The kiosk's own light/dark setting (config.theme) - previously only
  // editable from Settings on another device. Deliberately NOT gated on
  // being signed in as an adult: it's a property of the physical display
  // sitting on the wall (same trust level as the screensaver/refresh/
  // fullscreen buttons next to it), not a family-data mutation, so requiring
  // a PIN unlock just to flip it at dusk would be pure friction. Applied to
  // the DOM immediately rather than waiting on the SSE round-trip:
  // loadConfig()'s SSE-triggered refetch only re-applies data-mode while
  // nobody's signed in (see applyIdleTheme above), so a change made
  // mid-session would otherwise sit invisible until lock.
  async function toggleTheme() {
    if (!config?.id) return;
    const next = config.theme === 'dark' ? 'light' : 'dark';
    const prevAttr = document.documentElement.getAttribute('data-mode');
    document.documentElement.setAttribute('data-mode', next);
    setConfig({ ...config, theme: next });
    try {
      await dpatch('/display/theme', { theme: next });
    } catch {
      // Revert - e.g. a network hiccup; nothing else on this screen surfaces
      // API errors.
      document.documentElement.setAttribute('data-mode', prevAttr ?? 'light');
      setConfig((c) => (c ? { ...c, theme: next === 'dark' ? 'light' : 'dark' } : c));
    }
  }

  // Tracked in a ref (not state) so loadConfig's identity stays stable across
  // unlock/lock - it's a dependency of the mount effect that opens the SSE
  // stream, and that stream shouldn't reconnect every time a profile switches.
  const activeRef = useRef<UnlockResult | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Same reason: the SSE mount effect needs this kiosk's own display-config
  // id to decide whether a remote reload push is actually for it (an adult
  // can target one kiosk, or all of them), without reconnecting the stream
  // every time config reloads.
  const configIdRef = useRef<string | null>(null);
  useEffect(() => {
    configIdRef.current = config?.id ?? null;
  }, [config?.id]);

  // The display's own light/dark mode (data-mode) - a property of the
  // physical kiosk, never overridden by whoever's signed in (see unlock()
  // below). data-theme (the color hue) resets to this kiosk's own configured
  // default here (Settings > Touch displays > Default color theme) and is
  // the only thing a signed-in profile's own preference changes.
  const applyIdleTheme = useCallback((c: ResolvedDisplayConfig) => {
    document.documentElement.setAttribute('data-mode', c.theme === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', c.colorTheme || 'meadow');
    document.documentElement.setAttribute('data-font-size', ['sm', 'lg', 'xl'].includes(c.fontSize) ? c.fontSize : 'md');
  }, []);

  // Household widgets bundle (meals/countdowns/announcements/grocery) and the
  // family's feature switches - both readable with just the display token.
  const [household, setHousehold] = useState<{
    today: string;
    meals: Array<{ date: string; title: string; isEatingOut?: boolean; eatOutPlaceName?: string | null }>;
    countdowns: Array<{ id: string; title: string; emoji: string; date: string }>;
    announcements: Array<{ id: string; text: string }>;
    groceryOpen: number;
  } | null>(null);
  const [famDisabled, setFamDisabled] = useState<string[]>([]);
  const [bedtimePeekUntil, setBedtimePeekUntil] = useState(0);
  const loadHousehold = useCallback(() => {
    dget<NonNullable<typeof household>>('/display/household').then(setHousehold).catch(() => setHousehold(null));
    dget<{ disabledFeatures?: string[]; soundAssignments?: Record<string, SoundAssignment> }>('/display/family-settings')
      .then((f) => {
        setFamDisabled(f.disabledFeatures ?? []);
        // 'tokens' is top-level (no ancestors to walk) - a direct check is
        // equivalent to familyFeatureEnabled() here and avoids needing a
        // full FamilySettings-shaped object just for this one flag.
        setTokensBadgeEnabled(!(f.disabledFeatures ?? []).includes('tokens'));
        dget<{ id: string; dataUri: string }[]>('/display/custom-sounds')
          .then((custom) => setSoundAssignments(f.soundAssignments, custom))
          .catch(() => setSoundAssignments(f.soundAssignments, []));
      })
      .catch(() => undefined);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch widgets on live-update pushes
  useEffect(() => {
    loadHousehold();
  }, [dataRefreshSignal]);

  const loadConfig = useCallback(async () => {
    const c = await dget<ResolvedDisplayConfig>('/display/config');
    setConfig(c);
    // Kiosk is the one surface with speakers on purpose - celebration sound
    // follows this display's own setting (Settings > Touch displays).
    setCelebrationSound(c.soundEffects !== false);
    if (!activeRef.current) applyIdleTheme(c);
  }, [applyIdleTheme]);

  // Re-fetched whenever the profile picker is shown again (see "Switch / lock"
  // below), not just once at mount - otherwise a PIN set mid-session keeps
  // showing as absent (no 🔒 badge) and picking that profile again skips
  // straight to unlock() with no PIN entered, which then just fails silently.
  const loadMembers = useCallback(() => {
    dget<Member[]>('/display/members').then(setMembers).catch(() => setMembers([]));
    dget<Balance[]>('/display/balances').then(setPickerBalances).catch(() => setPickerBalances([]));
  }, []);

  useEffect(() => {
    lockIfAdultRef.current = () => {
      const cur = activeRef.current;
      const role = cur?.user.role;
      if (cur && config && (role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT')) {
        setActive(null);
        setLevelUpTo(null);
        loadMembers();
        applyIdleTheme(config);
      }
    };
  }, [applyIdleTheme, loadMembers, config]);

  useEffect(() => {
    loadHousehold();
    loadConfig().catch(() => setError('This display link is invalid or was revoked. Ask the family owner for a new one.'));
    loadMembers();

    // Chore/prize/token/calendar mutations elsewhere (another device, or the
    // scheduled miss-sweep) push a typed event here so this kiosk reflects
    // them immediately instead of only on next reload. Config changes (the
    // legacy/untyped case too, for anything published before this existed)
    // fall through to loadConfig - the safest catch-all.
    let stopped = false;
    let es: EventSource | null = null;
    let retryTimer: number | undefined;

    function connect() {
      if (stopped) return;
      const streamUrl = `${BASE_URL}/display/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const source = new EventSource(streamUrl, { withCredentials: true });
      es = source;
      source.onmessage = (e) => {
        let payload: { type?: string; displayConfigId?: string | null } = {};
        try {
          payload = JSON.parse(e.data) ?? {};
        } catch {
          // legacy/untyped payload - treat as a config change
        }
        const type = payload.type ?? 'display';
        if (type === 'reload') {
          // Untargeted (no displayConfigId) means "every kiosk in the family" -
          // an adult fixing a stuck/broken kiosk from Settings without walking
          // over to the Pi. Targeted means only the one they picked.
          if (!payload.displayConfigId || payload.displayConfigId === configIdRef.current) {
            hardReload();
          }
          return;
        }
        if (type === 'ping') {
          // Pure keep-alive (see DisplayEventsService.stream) - nothing to do,
          // its only job is to keep this connection from going idle.
          return;
        }
        if (type === 'calendar') {
          refreshEventsRef.current();
        } else if (type === 'chores' || type === 'prizes' || type === 'tokens') {
          refreshChores();
          setDataRefreshSignal((n) => n + 1);
          // The idle picker's token/level badges (pickerBalances) were only
          // ever loaded once on mount or when locking an adult back out - a
          // balance change pushed while the picker was already on screen (a
          // sibling using another kiosk, or the main app) never showed up
          // until one of those two triggers happened to fire again.
          loadMembers();
        } else {
          loadConfig().catch(() => undefined);
        }
      };
      // The browser's own auto-retry only covers a mid-stream drop. Per spec,
      // if a *reconnect* attempt gets a non-2xx response (a 502 while the
      // server container is mid-restart during a deploy, or any brief origin
      // blip) the EventSource permanently closes itself instead - readyState
      // goes to CLOSED and it never tries again on its own, silently, with no
      // visible error on the kiosk. That's exactly how this stayed "stuck"
      // for good after one badly-timed deploy. Detect that specific case and
      // reconnect ourselves.
      source.onerror = () => {
        if (stopped) return;
        if (source.readyState === EventSource.CLOSED) {
          source.close();
          retryTimer = window.setTimeout(connect, 5000);
        }
      };
    }
    connect();

    return () => {
      stopped = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      es?.close();
    };
  }, [loadConfig, loadMembers, refreshChores]);

  // Paging months/weeks used to blink: Calendar.tsx's grid remounts (and its
  // slide-in animation plays) the instant the cursor changes - free, no
  // network involved - but this array stayed whatever the PREVIOUS range's
  // events were until the new fetch resolved, then replaced all at once.
  // On a real network round-trip (even a fast one), that reads as "new month
  // slides in showing stale events, then they pop" - not a clean slide.
  //
  // Cache by range+user so re-visiting a range already fetched this session
  // is instant (stale-while-revalidate: serve the cached array immediately,
  // still refetch in the background to catch anything that changed), and
  // prefetch the adjacent range in the direction just paged so the NEXT
  // press is usually already warm too. Capped at 6 entries (current + a
  // couple pages either side) - this is a kiosk that runs for weeks, not
  // a cache meant to remember every range ever visited.
  const eventsCache = useRef(new Map<string, CalEvent[]>());
  const rangeKey = useCallback(
    (r: { start: string; end: string }) => `${active?.user.id ?? ''}|${r.start}|${r.end}`,
    [active?.user.id],
  );

  const fetchRange = useCallback(
    (r: { start: string; end: string }): Promise<CalEvent[]> =>
      dget<CalEvent[]>('/display/events', {
        start: r.start,
        end: r.end,
        ...(active ? { userId: active.user.id } : {}),
      }),
    [active],
  );

  function cacheSet(key: string, evs: CalEvent[]) {
    const cache = eventsCache.current;
    cache.delete(key); // re-insert at the end so this counts as most-recently-used
    cache.set(key, evs);
    while (cache.size > 6) cache.delete(cache.keys().next().value as string);
  }

  const refreshEvents = useCallback(() => {
    if (!range) return;
    const key = rangeKey(range);
    const cached = eventsCache.current.get(key);
    if (cached) setEvents(cached); // instant - no blank/stale gap while the background refresh below runs
    fetchRange(range)
      .then((evs) => {
        cacheSet(key, evs);
        setEvents(evs);
      })
      .catch(() => {
        if (!cached) setEvents([]);
      });

    // Prefetch both neighboring pages (same span as the current range, shifted
    // by its own length) - cache-only, never touches `events` state, so a
    // slow/failed prefetch can't affect what's on screen right now.
    const spanMs = new Date(range.end).getTime() - new Date(range.start).getTime();
    for (const dir of [-1, 1] as const) {
      const neighbor = {
        start: new Date(new Date(range.start).getTime() + dir * spanMs).toISOString(),
        end: new Date(new Date(range.end).getTime() + dir * spanMs).toISOString(),
      };
      const neighborKey = rangeKey(neighbor);
      if (eventsCache.current.has(neighborKey)) continue;
      fetchRange(neighbor)
        .then((evs) => cacheSet(neighborKey, evs))
        .catch(() => undefined);
    }
  }, [range, rangeKey, fetchRange]);

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

  // Holidays can be on a display's configured calendars (to be seen) without
  // being a real writable calendar underneath - see CalendarPage's identical
  // addableOptions for why these are excluded from add/edit specifically.
  const addableCalendarOptions = useMemo(() => calendarOptions.filter((c) => c.source !== 'holiday'), [calendarOptions]);
  const addableCalendarIds = useMemo(() => new Set(addableCalendarOptions.map((c) => c.id)), [addableCalendarOptions]);

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
      // applyIdleTheme) - it's a property of the physical display, not the
      // person. Only the color hue follows whoever's signed in.
      document.documentElement.setAttribute('data-theme', result.user.colorTheme || 'meadow');
      setPinFor(null);
      setPin('');
      setPinError(null);
      // #4 - a kiosk unlock is one of the three spots that count as
      // "actually looking at this person" (see users.service.ts).
      api
        .levelCheck(result.token)
        .then((r) => {
          if (r.leveledUp) {
            setLevelUpTo(r.newLevel);
            celebrate(undefined, 'levelUp');
          }
        })
        .catch(() => undefined);
    } catch {
      // If this came from the no-PIN-prompt path (a stale "no PIN" flag) the
      // dialog was never open - open it now instead of failing invisibly.
      setPinFor(m);
      setPin('');
      setPinError('Wrong PIN - try again.');
    }
  }

  // Same reasoning as the header's own Exit button below - this screen has
  // no router and no other way back, so an error or a hang-on-load (a kid's
  // most likely "I'm stuck" moment, more so than the normal rendered view)
  // needs its own way out too, same !token gate.
  const exitLink = !token && (
    <a href="/" className="mt-2 text-sm text-slate-400 underline hover:text-slate-600">
      ← Back to the app
    </a>
  );
  if (error)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-10 text-center text-slate-500">
        {error}
        {exitLink}
      </div>
    );
  if (!config)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-slate-500">
        <Logo size={120} />
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
        <span>Loading display…</span>
        {exitLink}
      </div>
    );

  // Ancestor-aware, not a raw list check - a sub-feature (meals, levels, ...)
  // also needs its top-level module (household, tokens, ...) on, same rule
  // familyFeatureEnabled() applies everywhere else in the app.
  const famOn = (f: string) => familyFeatureEnabled({ disabledFeatures: famDisabled } as FamilySettings, f);
  const showCalendar = config.enabledFeatures.includes('calendar');
  const showChores = config.enabledFeatures.includes('chores') && famOn('chores');
  const showPrizes = config.enabledFeatures.includes('prizes') && famOn('store');
  const showMeals = config.enabledFeatures.includes('meals') && famOn('meals');
  const showGrocery = config.enabledFeatures.includes('grocery') && famOn('grocery');
  const showCountdowns = config.enabledFeatures.includes('countdowns') && famOn('countdowns');
  const showAnnouncements = config.enabledFeatures.includes('announcements') && famOn('announcements');
  const todayMeal = household?.meals.find((m) => m.date === household.today);
  const upcomingCountdowns = (household?.countdowns ?? []).slice(0, 3);
  // Bedtime mode: inside the configured window the kiosk dims to a good-night
  // screen; a tap "peeks" for 5 minutes. Window may cross midnight.
  const inBedtime = (() => {
    if (!config.bedtimeStart || !config.bedtimeEnd) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = config.bedtimeStart.split(':').map(Number);
    const [eh, em] = config.bedtimeEnd.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
  })();
  const personFocused = !!active && layout === 'person' && showCalendar && (showChores || showPrizes);

  return (
    <div className="kiosk-mode flex h-screen flex-col overflow-hidden p-4">
      {levelUpTo !== null && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <LucideIcon name="star" size={60} />
          <h2 className="text-3xl font-extrabold text-white">Level {levelUpTo}!</h2>
          <p className="max-w-xs text-center text-sm text-slate-300">
            {active?.user.displayName} reached level {levelUpTo} - keep it up!
          </p>
          <button onClick={() => setLevelUpTo(null)} className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200">
            Nice!
          </button>
        </div>
      )}
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          {config.name && config.name !== 'Display' && (
            <span className="text-xl text-slate-400">· {config.name}</span>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <span className="text-xl text-slate-400">
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
          </span>
          <span className="text-xl text-slate-400">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          {weather && (
            <div className="relative">
              <button
                onClick={() => setShowForecast((v) => !v)}
                className="text-lg text-slate-400 hover:text-slate-600"
                title={weather.label}
              >
                {weather.icon} {weather.tempF}°F
              </button>
              {showForecast && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowForecast(false)} />
                  <div className="absolute right-0 z-50 mt-2 flex gap-3 rounded-lg border bg-white p-3 shadow-lg">
                    {weather.forecast.map((d) => (
                      <div key={d.date} className="flex flex-col items-center gap-0.5 text-xs text-slate-500" title={d.label}>
                        <span className="font-medium text-slate-700">
                          {parseLocalDate(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-base">{d.icon}</span>
                        <span>
                          {d.hi}°<span className="text-slate-400">/{d.lo}°</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {active && (isAdult || (showCalendar && addableCalendarOptions.length > 0)) && (
            <DropdownDetails
              summary="+ Add ▾"
              summaryClassName="cursor-pointer list-none rounded bg-slate-800 px-2 py-1 text-sm text-white hover:bg-slate-700"
            >
              <div className="absolute right-0 z-10 mt-1 w-44 rounded border bg-white p-1 text-sm shadow-lg">
                {showCalendar && addableCalendarOptions.length > 0 && (
                  <button
                    onClick={(e) => {
                      setPrefillDate(null);
                      setAddingEvent(true);
                      e.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    + Add event
                  </button>
                )}
                {isAdult && famOn('awards') && (
                  <button
                    onClick={(e) => {
                      setAddingAward(true);
                      e.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    + Add award
                  </button>
                )}
                {isAdult && showPrizes && (
                  <button
                    onClick={(e) => {
                      setAddingPrize(true);
                      e.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    + Add prize
                  </button>
                )}
                {isAdult && famOn('awards') && kioskPrizeClient && (
                  <button
                    onClick={async (e) => {
                      setAwardPickerOpen(true);
                      e.currentTarget.closest('details')?.removeAttribute('open');
                      try {
                        setAwardsCatalog(await kioskPrizeClient.awardsCatalog());
                      } catch {
                        setAwardsCatalog([]);
                      }
                    }}
                    className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <LucideIcon name="trophy" slot="kiosk.giveAward" size={14} /> Give award
                  </button>
                )}
                {isAdult && famOn('tokens') && (
                  <button
                    onClick={(e) => {
                      setAddingTokenAdjust(true);
                      e.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    🪙 Adjust {tokenName}
                  </button>
                )}
              </div>
            </DropdownDetails>
          )}
          {active && showCalendar && (showChores || showPrizes) && (
            <div className="flex rounded border p-0.5 text-sm text-slate-500">
              <button
                onClick={() => setLayout('calendar')}
                title="Calendar-focused"
                className={`flex items-center gap-1 rounded px-2 py-1 ${layout === 'calendar' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
              >
                <LucideIcon name="calendar" slot="kiosk.calendarView" size={14} /> Calendar
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
          {config.id && (
            <button
              onClick={toggleTheme}
              title={config.theme === 'dark' ? 'Switch this display to light mode' : 'Switch this display to dark mode'}
              className="kiosk-compact-btn rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              {config.theme === 'dark' ? '☀️' : '🌑'}
            </button>
          )}
          <button
            onClick={() => {
              lockIfAdultRef.current();
              setScreensaverOn(true);
            }}
            title="Screensaver"
            className="kiosk-compact-btn rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            🌙
          </button>
          <button
            onClick={hardReload}
            title="Refresh"
            className="kiosk-compact-btn rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ⟳
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            className="kiosk-compact-btn rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {isFullscreen ? '⤡' : '⛶'}
          </button>
          {/* Only when this is a session-authenticated preview (opened from
              Nav's "Display ↗" link, no ?token= in the URL) - never on the
              real Pi kiosk, which has no session to go "back" to and should
              never offer a way out. This screen renders completely outside
              react-router (see main.tsx) with nothing else to navigate
              anywhere with, so a mobile browser that opens the link in the
              SAME tab (rather than a new one) leaves no way back except a
              real page navigation - this button is exactly that. */}
          {!token && (
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              title="Back to the app"
              className="kiosk-compact-btn rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ← Exit
            </button>
          )}
        </div>
      </header>

      {showAnnouncements && (household?.announcements.length ?? 0) > 0 && (
        <div className="mt-2 flex shrink-0 items-center gap-3 overflow-x-auto rounded-lg px-3 py-1.5 text-sm" style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}>
          <span className="shrink-0"><LucideIcon name="emoji_1f4e3" slot="household.announcements" size={16} /></span>
          {household!.announcements.map((a) => (
            <span key={a.id} className="shrink-0 whitespace-nowrap">
              {a.text}
            </span>
          ))}
        </div>
      )}

      {(showMeals || showCountdowns || showGrocery) && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 text-sm">
          {showMeals && (
            <button
              onClick={() => setDinnerWeekOpen(true)}
              className="card-nested rounded-full px-3 py-1 hover:opacity-80"
              title="See the whole week's dinner plan"
            >
              <LucideIcon name="utensils-crossed" slot="kiosk.tonight" size={14} className="inline -mt-0.5" /> Tonight:{' '}
              <span className="font-semibold">
                {todayMeal
                  ? todayMeal.isEatingOut
                    ? todayMeal.eatOutPlaceName ?? 'Out - TBD'
                    : todayMeal.title
                  : 'nothing planned'}
              </span>
            </button>
          )}
          {showCountdowns &&
            upcomingCountdowns.map((c) => {
              const days = Math.max(0, Math.round((new Date(`${c.date}T00:00:00`).getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86_400_000));
              const revealed = revealedCountdowns.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    setRevealedCountdowns((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                  className="card-nested rounded-full px-3 py-1 hover:opacity-80"
                  title="Tap to see the date"
                >
                  <LucideIcon name={c.emoji} size={15} className="inline -mt-0.5" /> {c.title}:{' '}
                  <span className="font-semibold">
                    {revealed ? formatDate(new Date(`${c.date}T00:00:00`)) : days === 0 ? 'today!' : `${days}d`}
                  </span>
                </button>
              );
            })}
          {showGrocery && (household?.groceryOpen ?? 0) > 0 && (
            <span className="card-nested inline-flex items-center gap-1 rounded-full px-3 py-1">
              <LucideIcon name="shopping-cart" slot="kiosk.groceryCount" size={14} /> {household!.groceryOpen} on the list
            </span>
          )}
        </div>
      )}

      {/* Calendar (left, fills all remaining height) and a fixed-width right
          panel that always occupies the same place: the profile picker before
          sign-in, the signed-in person's chores after. In person-focused
          layout the two swap proportions - calendar shrinks to a small
          "windows-style" side widget (dots only) and the person's own stuff
          becomes the main event - but neither one's actual functionality
          changes: same Calendar component, same click-through day modal.

          Used to animate this swap with transition-all duration-300 - looked
          nice on a desktop's GPU, but measured live on the kiosk's own
          hardware via real frame timing: 12 of 32 frames over 33ms during
          that 300ms, two of them a 150ms dead stop right on click. `width`
          and `flex-basis` aren't GPU-composited like `transform`/`opacity`
          are - animating them forces a full layout recalc on every single
          frame, which is exactly what a "smooth" resize should never cost.
          An instant snap has zero animation cost and reads as more
          responsive than a stuttering "smooth" transition, not less. */}
      <div className="mt-3 flex min-h-0 flex-1 gap-6">
        {showCalendar && (
          <div className={`h-full ${personFocused ? 'w-72 shrink-0' : 'min-w-0 flex-1'}`}>
            <Calendar
              events={allCalendarEvents}
              onRangeChange={onRangeChange}
              touchControls
              onAddEvent={
                active && addableCalendarOptions.length > 0
                  ? (dateISO) => {
                      setPrefillDate(dateISO);
                      setAddingEvent(true);
                    }
                  : undefined
              }
              canEditEvent={(e) => addableCalendarIds.has(e.calendarId)}
              onEditEvent={active ? (e) => setEditingEvent(e) : undefined}
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
          <aside className={`flex h-full flex-col ${personFocused ? 'flex-1' : 'w-80 shrink-0'}`}>
            {active ? (
              <>
                <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                  <Avatar name={active.user.displayName} src={active.user.avatar} />
                  <span className="min-w-0 truncate font-medium">{active.user.displayName}</span>
                  <button
                    onClick={() => {
                      setActive(null);
                      setLevelUpTo(null);
                      loadMembers();
                      applyIdleTheme(config);
                    }}
                    className="ml-auto shrink-0 rounded border px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    Switch / lock
                  </button>
                </div>
                <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto" style={{ touchAction: 'pan-y' }}>
                  {/* Same things the main app's own pages give everyone -
                      rules and your own stats - reachable without switching
                      to a phone/tablet just to look at them. Kept at the very
                      top since they're a quick look-up, not something to dig
                      for under the chores list. */}
                  <div className="flex flex-wrap gap-2">
                    {famOn('rules') && (
                    <button onClick={() => setKioskRulesOpen(true)} className="flex items-center gap-1.5 rounded border px-3 py-2 text-sm hover:bg-slate-50">
                      <LucideIcon name="clipboard-list" slot="kiosk.rules" size={16} /> Rules
                    </button>
                    )}
                    <button onClick={() => setKioskStatsOpen(true)} className="flex items-center gap-1.5 rounded border px-3 py-2 text-sm hover:bg-slate-50">
                      <LucideIcon name="emoji_1f4ca" slot="kiosk.stats" size={16} /> My stats
                    </button>
                  </div>
                  {isAdult && kioskChoreClient && kioskPrizeClient && (
                    <PendingPanel
                      chores={chores}
                      client={kioskChoreClient}
                      prizeClient={kioskPrizeClient}
                      members={members}
                      tokenIcon={tokenIcon}
                      refreshSignal={dataRefreshSignal}
                      onChanged={refreshChores}
                    />
                  )}
                  {showChores && (
                    <ChoresPanel
                      me={active.user}
                      client={kioskChoreClient}
                      variant="today"
                      locationId={config.locationId}
                      refreshSignal={dataRefreshSignal}
                    />
                  )}
                  {showPrizes && (
                    <PrizesPanel
                      me={active.user}
                      client={kioskPrizeClient}
                      kioskToken={active.token}
                      refreshSignal={dataRefreshSignal}
                    />
                  )}
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
                <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto" style={{ touchAction: 'pan-y' }}>
                  {members.map((m) => {
                    // #9 - grayed doesn't block the tap (forcing a phone/app
                    // just to flip a status back would be worse than the
                    // problem) - it just tells the truth up front, so
                    // there's no surprise when the actions inside turn out
                    // to be limited (see PresenceService.assertActionable).
                    // "Home at a different house" only counts once they've
                    // actually picked one - a never-touched null stays
                    // neutral, not flagged, so families that haven't opted
                    // into this yet see every tile exactly as before.
                    const away = m.presenceStatus === 'AWAY' || m.presenceStatus === 'VACATION';
                    const wrongHouse = !away && !!config.locationId && !!m.presenceLocationId && m.presenceLocationId !== config.locationId;
                    const grayed = away || wrongHouse;
                    return (
                    <button
                      key={m.id}
                      onClick={() => selectProfile(m)}
                      className={`flex w-full items-center gap-3 rounded-full border bg-white p-2 text-left hover:bg-slate-100 ${grayed ? 'opacity-50' : ''}`}
                    >
                      <Avatar name={m.displayName} src={m.avatar} big />
                      <span className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 truncate text-sm font-medium">
                          <LucideIcon name={ROLE_ICON[m.role]} slot={ROLE_SLOT[m.role]} size={14} />
                          {m.displayName}
                        </div>
                        {/* Reserve this line's height for every row so rows stay aligned. */}
                        <div className="flex h-[14px] items-center gap-1 text-[10px] text-slate-400">
                          {grayed ? (
                            <>
                              <LucideIcon
                                name={m.presenceStatus === 'VACATION' ? 'plane' : 'moon'}
                                slot={m.presenceStatus === 'VACATION' ? 'badge.presenceVacation' : 'badge.presenceAway'}
                                size={10}
                              />
                              {m.presenceStatus === 'VACATION' ? 'On vacation' : away ? 'Away' : 'At another house'}
                            </>
                          ) : (m.hasPin || m.role !== 'KID') ? '🔒 PIN' : ''}
                        </div>
                      </span>
                      {!m.tokensDisabled && famOn('tokens') && (
                        <span className="flex shrink-0 flex-col items-end gap-0.5 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                          <span className="flex items-center gap-1">
                            <LucideIcon name={tokenIcon} size={14} />
                            {pickerBalances.find((b) => b.userId === m.id)?.balance ?? 0}
                          </span>
                          {famOn('levels') && <LevelBadge earned={pickerBalances.find((b) => b.userId === m.id)?.earned ?? 0} />}
                        </span>
                      )}
                    </button>
                    );
                  })}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {inBedtime && Date.now() > bedtimePeekUntil && (
        <button
          onClick={() => setBedtimePeekUntil(Date.now() + 5 * 60_000)}
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 text-slate-400"
          style={{ background: 'rgba(0,0,0,0.92)' }}
        >
          <span className="text-7xl">🌙</span>
          <span className="text-4xl font-semibold text-slate-300">
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
          </span>
          <span className="text-lg">Good night - tap to peek for 5 minutes</span>
        </button>
      )}

      {(addingEvent || editingEvent) && active && (
        <AddEventModal
          options={addableCalendarOptions}
          initialDate={prefillDate ?? undefined}
          existing={editingEvent ?? undefined}
          showMeal={showMeals}
          canEditMeal={isAdult}
          mealLocationId={config.locationId}
          onClose={() => {
            setAddingEvent(false);
            setEditingEvent(null);
          }}
          onCreate={async (calendarId, body) => {
            await api.createCalendarEvent(calendarId, body, active.token);
            setAddingEvent(false);
            refreshEvents();
          }}
          onUpdate={async (calendarId, eventId, body) => {
            await api.updateCalendarEvent(calendarId, eventId, body, active.token);
            setEditingEvent(null);
            refreshEvents();
          }}
          onDelete={async (calendarId, eventId) => {
            await api.deleteCalendarEvent(calendarId, eventId, active.token);
            setEditingEvent(null);
            refreshEvents();
          }}
        />
      )}

      {addingAward && active && (
        <AwardForm award={null} kioskToken={active.token} onClose={() => setAddingAward(false)} onSaved={() => setAddingAward(false)} />
      )}

      {/* Two-step: pick which existing award to hand out, then GrantModal
          (the same flow AwardsPage.tsx uses) actually gives it - this was
          missing entirely on the kiosk before, "+ Add award" only ever
          defined new award types, never handed one out. */}
      {awardPickerOpen && active && (
        <Modal
          header={<h3 className="text-lg font-semibold">Give an award</h3>}
          onBackdropClick={() => setAwardPickerOpen(false)}
          footer={
            <button onClick={() => setAwardPickerOpen(false)} className="rounded border px-3 py-1.5 text-sm">
              Cancel
            </button>
          }
        >
          <ul className="space-y-1">
            {awardsCatalog.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    setAwardPickerOpen(false);
                    setGrantingAward(a);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <AwardIcon icon={a.icon} />
                  {a.name}
                </button>
              </li>
            ))}
            {awardsCatalog.length === 0 && (
              <li className="text-sm text-slate-400">No awards yet - use "+ Add award" to create one first.</li>
            )}
          </ul>
        </Modal>
      )}

      {grantingAward && active && (
        <GrantModal
          award={grantingAward}
          kids={members.filter((m) => m.role === 'KID')}
          tokenName={tokenName}
          kioskToken={active.token}
          onClose={() => setGrantingAward(null)}
          onGranted={() => setGrantingAward(null)}
        />
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

      {addingTokenAdjust && kioskPrizeClient && (
        <TokenAdjustModal
          members={members}
          client={kioskPrizeClient}
          tokenName={tokenName}
          onClose={() => setAddingTokenAdjust(false)}
          onSaved={() => setAddingTokenAdjust(false)}
        />
      )}

      {dinnerWeekOpen && household && (
        <DinnerWeekModal
          around={household.today}
          locationId={config.locationId}
          canEdit={isAdult}
          kioskToken={active?.token}
          kioskDisplay
          onClose={() => setDinnerWeekOpen(false)}
        />
      )}

      {kioskRulesOpen && active && (
        <Modal onBackdropClick={() => setKioskRulesOpen(false)} footer={
          <button onClick={() => setKioskRulesOpen(false)} className="rounded border px-4 py-2.5 text-base hover:bg-slate-50">
            Close
          </button>
        }>
          <RulesPage me={active.user} kioskToken={active.token} />
        </Modal>
      )}

      {kioskStatsOpen && active && (
        <KioskStatsModal
          userId={active.user.id}
          displayName={active.user.displayName}
          tokenName={tokenName}
          tokenIcon={tokenIcon}
          chores={chores}
          kioskToken={active.token}
          onClose={() => setKioskStatsOpen(false)}
        />
      )}

      <OnScreenKeyboard enabled={!!config.onScreenKeyboard} />

      {screensaverOn && <Screensaver weather={weather} onDismiss={() => setScreensaverOn(false)} />}

      {pinFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-card w-full max-w-xs rounded-lg bg-white p-6 text-center">
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
