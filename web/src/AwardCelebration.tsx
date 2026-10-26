import { useCallback, useEffect, useRef, useState } from 'react';
import { api, DATA_REFRESH_EVENT, type UnseenAward } from './api';
import { fireworks } from './celebrate';
import { AwardIcon } from './AwardIcon';
import TokenBadge from './TokenBadge';

// How recently the person must have touched the screen for us to count them
// as "there". A popup that fires into an empty room (kiosk on the wall, a
// phone in a pocket) would burn its fireworks and sound for nobody - so it
// waits, still pending on the server, and opens the moment they next interact.
const ACTIVE_WINDOW_MS = 45_000;
// Delay between that touch and the popup, so the same tap that woke the
// screen can't land on the popup's button and dismiss it unseen.
const OPEN_DELAY_MS = 900;
const POLL_MS = 30_000;

// "You got an award" popup for whoever is signed in (the app) or the active
// kiosk profile. Source of truth is the server (AwardGrant.seenAt): grants
// stay pending until THIS person dismisses the popup, so being away, on
// another screen, or behind the kiosk screensaver never loses one.
//
// Mounted in both the app (cookie session) and the kiosk (kioskToken) - no
// react-router hooks in here since the kiosk runs outside <BrowserRouter>;
// the app passes `onPlayGame` to jump to where a bundled reward game lives.
export default function AwardCelebration({
  kioskToken,
  tokenIcon,
  paused = false,
  refreshSignal,
  onPlayGame,
}: {
  kioskToken?: string;
  tokenIcon: string;
  // Kiosk screensaver up (or anything else that means nobody can see this).
  paused?: boolean;
  // The kiosk's live-update counter - bump = check for new awards right now
  // instead of waiting out the poll.
  refreshSignal?: number;
  onPlayGame?: () => void;
}) {
  const [queue, setQueue] = useState<UnseenAward[]>([]);
  const [current, setCurrent] = useState<UnseenAward | null>(null);
  const [canDismiss, setCanDismiss] = useState(false);
  const lastActive = useRef(Date.now());
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pausedRef = useRef(paused);
  const currentRef = useRef<UnseenAward | null>(null);
  const queueRef = useRef<UnseenAward[]>([]);
  currentRef.current = current;
  queueRef.current = queue;
  pausedRef.current = paused;
  // Grants dismissed this session, so a poll that lands before the POST
  // finishes can't resurrect one.
  const dismissed = useRef(new Set<string>());

  const load = useCallback(() => {
    api
      .unseenAwards(kioskToken)
      .then((list) => setQueue(list.filter((a) => !dismissed.current.has(a.id))))
      .catch(() => undefined);
  }, [kioskToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    window.addEventListener(DATA_REFRESH_EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(DATA_REFRESH_EVENT, load);
    };
  }, [load]);

  useEffect(() => {
    if (refreshSignal !== undefined) load();
  }, [refreshSignal, load]);

  const isActive = () =>
    document.visibilityState === 'visible' && !pausedRef.current && Date.now() - lastActive.current < ACTIVE_WINDOW_MS;

  const tryOpen = useCallback(() => {
    if (currentRef.current || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = undefined;
      if (currentRef.current || !isActive()) return;
      const next = queueRef.current[0];
      if (!next) return;
      setCurrent(next);
      setQueue((q) => q.filter((a) => a.id !== next.id));
    }, OPEN_DELAY_MS);
  }, []);

  useEffect(() => {
    const onActivity = () => {
      lastActive.current = Date.now();
      if (!currentRef.current) tryOpen();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => document.addEventListener(e, onActivity, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryOpen();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach((e) => document.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
    };
  }, [tryOpen]);

  // Anything newly queued, or the screensaver coming down, re-checks whether
  // there's someone to show it to right now.
  useEffect(() => {
    if (queue.length && !current && isActive()) tryOpen();
  }, [queue, current, paused, tryOpen]);

  // The show itself, once per popup.
  useEffect(() => {
    if (!current) return;
    fireworks('awardGranted');
    setCanDismiss(false);
    const t = setTimeout(() => setCanDismiss(true), 1200);
    return () => clearTimeout(t);
  }, [current]);

  function dismiss(thenPlay = false) {
    if (!current || !canDismiss) return;
    const id = current.id;
    dismissed.current.add(id);
    api.markAwardSeen(id, kioskToken).catch(() => undefined);
    setCurrent(null);
    if (thenPlay) onPlayGame?.();
    // More waiting? Give a beat before the next one so it feels like its own moment.
    setTimeout(tryOpen, 600);
  }

  if (!current) return null;
  const hasBreakdown = current.tokenValue > 0 || current.streakFreezeValue > 0 || current.hasGame;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.78)' }}>
      <div className="panel my-auto w-full max-w-md p-6 text-center" role="dialog" aria-label="You earned an award">
        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          You earned an award!
        </p>
        <div className="mt-3 flex justify-center">
          <AwardIcon icon={current.icon} size={88} />
        </div>
        <h2 className="mt-3 break-words text-3xl font-extrabold">{current.awardName}</h2>
        {current.description && <p className="mt-1 break-words text-sm text-slate-500">{current.description}</p>}

        <p className="mt-4 text-sm text-slate-500">
          From <span className="font-semibold">{current.grantedByName}</span>
        </p>
        {current.note && (
          <div className="card-nested mt-2 rounded-lg p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why you got it</p>
            <p className="mt-1 break-words text-base">{current.note}</p>
          </div>
        )}

        {hasBreakdown && (
          <div className="card-nested mt-3 rounded-lg p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">What you got</p>
            <ul className="mt-2 space-y-2 text-base">
              {current.tokenValue > 0 && (
                <li className="flex items-center gap-2">
                  <TokenBadge icon={tokenIcon} amount={`+${current.tokenValue}`} size="lg" />
                </li>
              )}
              {current.streakFreezeValue > 0 && (
                <li>
                  🧊 {current.streakFreezeValue} streak freeze{current.streakFreezeValue === 1 ? '' : 's'}
                </li>
              )}
              {current.hasGame && <li>🎮 A reward game is waiting for you!</li>}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {current.hasGame && onPlayGame && (
            <button
              onClick={() => dismiss(true)}
              disabled={!canDismiss}
              className="rounded-lg bg-slate-800 px-6 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
            >
              Play it now
            </button>
          )}
          <button
            onClick={() => dismiss()}
            disabled={!canDismiss}
            className={`rounded-lg px-6 py-2.5 font-semibold disabled:opacity-40 ${
              current.hasGame && onPlayGame ? 'border hover:bg-slate-50' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            {queue.length > 0 ? 'Next' : 'Awesome!'}
          </button>
        </div>
      </div>
    </div>
  );
}
