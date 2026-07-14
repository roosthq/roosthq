import { useCallback, useEffect, useState } from 'react';
import {
  BASE_URL,
  choreClient,
  type CalEvent,
  type DisplaySettings,
  type Member,
  type UnlockResult,
} from './api';
import Calendar from './Calendar';
import ChoresPanel from './ChoresPanel';

const token = new URLSearchParams(window.location.search).get('token');

function displayUrl(path: string): string {
  if (!token) return `${BASE_URL}${path}`;
  return `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

async function dget<T>(path: string): Promise<T> {
  const res = await fetch(displayUrl(path), { credentials: 'include' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

async function dpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(displayUrl(path), {
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

// Interactive kiosk: passive calendar always visible; pick a profile (PIN for adults,
// optional for kids) to manage that person's chores from the touch screen.
export default function Display() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [active, setActive] = useState<UnlockResult | null>(null);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    dget<DisplaySettings>('/display/settings')
      .then(setSettings)
      .catch(() => setError('This display link is invalid or was revoked. Ask the family owner for a new one.'));
    dget<Member[]>('/display/members').then(setMembers).catch(() => setMembers([]));

    const es = new EventSource(displayUrl('/display/stream'), { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        setSettings(JSON.parse(ev.data) as DisplaySettings);
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!range) return;
    dget<CalEvent[]>(
      `/display/events?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
    )
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [range, settings]);

  const onRangeChange = useCallback((s: string, e: string) => setRange({ start: s, end: e }), []);

  function selectProfile(m: Member) {
    const needsPin = m.hasPin || m.role !== 'KID';
    if (needsPin) {
      setPinFor(m);
      setPin('');
      setPinError(null);
    } else {
      unlock(m, undefined);
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
  if (!settings)
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading display…</div>;

  const showCalendar = settings.enabledFeatures.includes('calendar');
  const showChores = settings.enabledFeatures.includes('chores');

  return (
    <div className="min-h-screen bg-white p-8 text-slate-800">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-4xl font-bold">Roost HQ</h1>
        <div className="flex items-center gap-3">
          <span className="text-xl text-slate-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </header>

      {/* Profile bar */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {active ? (
          <>
            <span className="text-sm text-slate-500">Signed in as</span>
            <span className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3">
              <Avatar name={active.user.displayName} src={active.user.avatar} />
              <span className="font-medium">{active.user.displayName}</span>
            </span>
            <button onClick={() => setActive(null)} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">
              Switch / lock
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-slate-500">Tap your photo to manage chores:</span>
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => selectProfile(m)}
                className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100"
              >
                <Avatar name={m.displayName} src={m.avatar} big />
                <span className="text-sm">{m.displayName}</span>
                {(m.hasPin || m.role !== 'KID') && <span className="text-[10px] text-slate-400">🔒 PIN</span>}
              </button>
            ))}
            {members.length === 0 && <span className="text-sm text-slate-400">No profiles yet.</span>}
          </>
        )}
      </div>

      {showCalendar && <Calendar events={events} onRangeChange={onRangeChange} size="large" />}

      {showChores && active && (
        <ChoresPanel me={active.user} client={choreClient(active.token)} />
      )}
      {showChores && !active && (
        <p className="mt-8 text-slate-400">Tap a profile above to view and manage chores.</p>
      )}

      {/* PIN modal */}
      {pinFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={() => setPinFor(null)}>
          <div className="w-full max-w-xs rounded-lg bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
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
