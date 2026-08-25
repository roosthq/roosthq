import { useCallback, useEffect, useState } from 'react';
import { api, DATA_REFRESH_EVENT, type PendingWheel } from './api';
import DropdownDetails from './DropdownDetails';
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
      <DropdownDetails
        summary={
          <span className="inline-flex items-center gap-1">
            <LucideIcon name="gift" size={size === 'lg' ? 22 : 14} /> {games.length}
          </span>
        }
        summaryClassName={
          size === 'lg'
            ? 'cursor-pointer list-none rounded-full px-3 py-2 text-base font-medium hover:bg-slate-100'
            : 'cursor-pointer list-none rounded-full px-2.5 py-1 text-sm font-medium hover:bg-slate-100'
        }
      >
        <div className="absolute right-0 z-30 mt-2 w-72 max-w-[90vw] rounded-lg border bg-white p-3 text-sm shadow-lg">
          <p className="mb-2 font-semibold">Reward games waiting ({games.length})</p>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {games.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 rounded border p-2">
                <span className="min-w-0 flex-1 truncate">{source(g.reason)}</span>
                <button
                  onClick={() => setPlaying(g)}
                  disabled={presenceBlocked}
                  className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800"
                >
                  ▶ Play
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DropdownDetails>
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
