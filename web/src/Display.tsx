import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  BASE_URL,
  choreClient,
  prizeClient,
  type CalEvent,
  type ResolvedDisplayConfig,
  type Member,
  type SharedCalendar,
  type UnlockResult,
} from './api';
import Calendar from './Calendar';
import ChoresPanel from './ChoresPanel';
import PrizesPanel from './PrizesPanel';
import AddEventModal from './AddEventModal';
import Logo from './Logo';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const configId = params.get('config');

async function dget<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  const sp = new URLSearchParams(extra);
  if (token) sp.set('token', token);
  if (configId) sp.set('config', configId);
  const qs = sp.toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

async function dpost<T>(path: string, body: unknown): Promise<T> {
  const sp = new URLSearchParams();
  if (token) sp.set('token', token);
  if (configId) sp.set('config', configId);
  const qs = sp.toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
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

  const loadConfig = useCallback(async () => {
    const c = await dget<ResolvedDisplayConfig>('/display/config');
    setConfig(c);
    document.documentElement.setAttribute('data-theme', c.theme === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-font-size', ['sm', 'lg', 'xl'].includes(c.fontSize) ? c.fontSize : 'md');
  }, []);

  useEffect(() => {
    loadConfig().catch(() => setError('This display link is invalid or was revoked. Ask the family owner for a new one.'));
    dget<Member[]>('/display/members').then(setMembers).catch(() => setMembers([]));

    const streamUrl = `${BASE_URL}/display/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(streamUrl, { withCredentials: true });
    es.onmessage = () => {
      loadConfig().catch(() => undefined);
    };
    return () => es.close();
  }, [loadConfig]);

  const refreshEvents = useCallback(() => {
    if (!range) return;
    dget<CalEvent[]>('/display/events', { start: range.start, end: range.end })
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [range]);

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
      setPinFor(null);
      setPin('');
      setPinError(null);
    } catch {
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
          {active && showCalendar && calendarOptions.length > 0 && (
            <button
              onClick={() => setAddingEvent(true)}
              className="rounded border px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              + Add event
            </button>
          )}
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
          sign-in, the signed-in person's chores after. */}
      <div className="mt-3 flex min-h-0 flex-1 gap-6">
        {showCalendar && (
          <div className="h-full min-w-0 flex-1">
            <Calendar events={events} onRangeChange={onRangeChange} size={active ? 'compact' : 'normal'} fill />
          </div>
        )}

        {(showChores || showPrizes) && (
          <aside className="flex h-full w-80 shrink-0 flex-col">
            {active ? (
              <>
                <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                  <Avatar name={active.user.displayName} src={active.user.avatar} />
                  <span className="min-w-0 truncate font-medium">{active.user.displayName}</span>
                  <button
                    onClick={() => setActive(null)}
                    className="ml-auto shrink-0 rounded border px-2 py-1 text-xs hover:bg-white"
                  >
                    Switch / lock
                  </button>
                </div>
                <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {showChores && <ChoresPanel me={active.user} client={kioskChoreClient} variant="today" />}
                  {showPrizes && <PrizesPanel me={active.user} client={kioskPrizeClient} />}
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
