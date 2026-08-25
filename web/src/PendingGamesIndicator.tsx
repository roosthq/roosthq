import { useCallback, useEffect, useState } from 'react';
import { api, DATA_REFRESH_EVENT, type PendingWheel } from './api';
import ResponsiveDropdown from './ResponsiveDropdown';
import RewardRevealModal from './RewardRevealModal';
import LucideIcon from './LucideIcon';

// Same "still there is a gray blank spot on Chores" problem the ⏳ hourglass
// solved for pending chores/redemptions, but for #5 reward games: a kid
// earning one had no way to find it except stumbling onto the Chores page's
// own banner. Same header-level indicator pattern as PendingIndicator, own
// icon (🎁), reachable from every page - and unlike the hourglass, tapping
// an entry here plays the game right there instead of just linking away.
export default function PendingGamesIndicator({ tokenName, size = 'sm' }: { tokenName: string; size?: 'sm' | 'lg' }) {
  const [games, setGames] = useState<PendingWheel[]>([]);
  const [playing, setPlaying] = useState<PendingWheel | null>(null);
  // #9 - away/vacation blocks spinning outright, quietly (see Prize.tsx).
  const [presenceBlocked, setPresenceBlocked] = useState(false);

  const refresh = useCallback(() => {
    api.pendingWheels().then(setGames).catch(() => setGames([]));
    api.presenceMine().then((p) => setPresenceBlocked(p.status !== 'HOME')).catch(() => setPresenceBlocked(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    window.addEventListener(DATA_REFRESH_EVENT, refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener(DATA_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  // "Bonus wheel: Homework (5 in a row)" / "Reward game: Good behavior" /
  // "Surprise!" - strip the mechanical prefix, keep what actually earned it.
  function source(reason: string): string {
    return reason.replace(/^(Bonus wheel|Reward game):\s*/, '');
  }

  if (games.length === 0) return null;

  return (
    <>
      <ResponsiveDropdown
        trigger={
          <span className="inline-flex items-center gap-1">
            <LucideIcon name="gift" size={size === 'lg' ? 22 : 14} /> {games.length}
          </span>
        }
        triggerClassName={
          size === 'lg'
            ? 'cursor-pointer list-none rounded-full px-3 py-2 text-base font-medium hover:bg-slate-100'
            : 'cursor-pointer list-none rounded-full px-2.5 py-1 text-sm font-medium hover:bg-slate-100'
        }
        title={`Reward games waiting (${games.length})`}
        panelClassName="w-72 max-w-[90vw]"
      >
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {games.map((g) => (
            <li key={g.id} className="rounded border p-2">
              <div className="break-words text-sm">{source(g.reason)}</div>
              <button
                onClick={() => setPlaying(g)}
                disabled={presenceBlocked}
                className="mt-1.5 rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800"
              >
                ▶ Play
              </button>
            </li>
          ))}
        </ul>
      </ResponsiveDropdown>
      {playing && (
        <RewardRevealModal
          wheel={playing}
          source={source(playing.reason)}
          tokenName={tokenName}
          onSpin={() => api.spinWheel(playing.id)}
          onClose={() => {
            setPlaying(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
