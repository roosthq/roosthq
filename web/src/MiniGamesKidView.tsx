import { useEffect, useState } from 'react';
import { api, DATA_REFRESH_EVENT, type MiniGamePlaySession, type PublishedMiniGameItem, type PoolEntry } from './api';
import MiniGamePlayer from './MiniGamePlayer';
import { previewFor } from './miniGamePreviews';
import TokenBadge from './TokenBadge';
import Modal from './Modal';
import { useDialog } from './Dialog';

// Small chip row summarizing a pool's possibilities - same rounded-full tag
// look Award's own catalog cards use for "wheel"/"reward game" badges, so a
// prize pool reads the same visual language wherever it shows up.
export function PoolBadges({ pool, tokenIcon }: { pool: PoolEntry[]; tokenIcon: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pool.map((p, i) =>
        p.kind === 'TOKENS' ? (
          <TokenBadge key={i} icon={tokenIcon} amount={`${p.min}-${p.max}`} />
        ) : p.kind === 'STREAK_FREEZE' ? (
          <span key={i} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}>
            🧊 {p.min}-{p.max}
          </span>
        ) : (
          <span key={i} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}>
            🎁 prize
          </span>
        ),
      )}
    </div>
  );
}

function periodLabel(period: string) {
  return period === 'WEEK' ? 'week' : period === 'MONTH' ? 'month' : 'day';
}

// Opened by tapping a shop card - the deck's own "black box before Start"
// idea, one step earlier: an idle preview of the game itself, then the
// difficulty/price list to actually choose from. Kept separate from
// MiniGamePlayer's own pre-Start screen (that one commits to a single
// already-purchased session; this one is still picking which tier to buy).
function GameDetailModal({
  game,
  tokenIcon,
  onClose,
  onBuy,
}: {
  game: PublishedMiniGameItem;
  tokenIcon: string;
  onClose: () => void;
  onBuy: (tierId: string) => Promise<void>;
}) {
  const [buying, setBuying] = useState<string | null>(null);
  const Preview = previewFor(game.miniGame.gameType);
  const remaining = game.purchasesRemaining;
  const atLimit = remaining === 0;

  async function handleBuy(tierId: string) {
    setBuying(tierId);
    try {
      await onBuy(tierId);
      onClose();
    } finally {
      setBuying(null);
    }
  }

  return (
    <Modal maxWidthClass="max-w-md" header={<h3 className="text-lg font-semibold">{game.miniGame.icon || '🎮'} {game.miniGame.name}</h3>} footer={null}>
      <div className="flex flex-col gap-3">
        {Preview ? (
          <div className="w-full overflow-hidden rounded-xl">
            <Preview />
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl bg-slate-100 py-10 text-5xl">{game.miniGame.icon || '🎮'}</div>
        )}
        {game.miniGame.description && <p className="text-sm text-slate-500">{game.miniGame.description}</p>}
        {remaining !== undefined && (
          <p className={`text-xs ${atLimit ? 'font-medium text-red-500' : 'text-slate-400'}`}>
            {atLimit
              ? `You've used all ${game.purchaseLimitCount} plays for this ${periodLabel(game.purchaseLimitPeriod)} - check back next ${periodLabel(game.purchaseLimitPeriod)}.`
              : `${remaining} of ${game.purchaseLimitCount} plays left this ${periodLabel(game.purchaseLimitPeriod)}.`}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {game.tiers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded border p-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{t.label}</div>
                <PoolBadges pool={t.poolJson} tokenIcon={tokenIcon} />
              </div>
              <button
                onClick={() => handleBuy(t.id)}
                disabled={atLimit || buying !== null}
                className="shrink-0 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {buying === t.id ? 'Buying…' : `Buy · ${t.priceTokens}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// The kid-facing half of mini-games - pending queue (grants + bought-not-
// yet-played purchases) and the shop. Shared between the mobile Store tab
// (MiniGamesTab) and the kiosk's Prizes section (Display.tsx) - same
// component, `kioskToken` is the only thing that changes which session it
// acts on.
export default function MiniGamesKidView({ kioskToken, tokenIcon }: { kioskToken?: string; tokenIcon: string }) {
  const { alert } = useDialog();
  const [pending, setPending] = useState<(MiniGamePlaySession & { kind: 'grant' | 'purchase' })[]>([]);
  const [shop, setShop] = useState<PublishedMiniGameItem[]>([]);
  const [viewing, setViewing] = useState<PublishedMiniGameItem | null>(null);
  const [playing, setPlaying] = useState<{ session: MiniGamePlaySession; kind: 'grant' | 'purchase' } | null>(null);

  async function refresh() {
    const [grants, purchases, s] = await Promise.all([
      api.pendingMiniGameGrants(kioskToken),
      api.pendingMiniGamePurchases(kioskToken),
      api.miniGameShop(kioskToken),
    ]);
    setPending([...grants.map((g) => ({ ...g, kind: 'grant' as const })), ...purchases.map((p) => ({ ...p, kind: 'purchase' as const }))]);
    setShop(s);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kioskToken]);

  async function buy(tierId: string) {
    try {
      await api.purchaseMiniGameTier(tierId, kioskToken);
      // The purchase debited tokens server-side - refresh whatever balance
      // display isn't in this component's own tree (Store header, Profile).
      window.dispatchEvent(new Event(DATA_REFRESH_EVENT));
      await refresh();
    } catch (e) {
      await alert(e instanceof Error ? e.message : 'Could not buy that play.');
    }
  }

  if (playing) {
    return (
      <MiniGamePlayer
        session={playing.session}
        kind={playing.kind}
        kioskToken={kioskToken}
        onDone={() => {
          setPlaying(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pending.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-500">Games waiting for you</h4>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((s) => (
              <li key={s.kind + s.id} className="flex items-center gap-3 rounded border bg-white p-3">
                <div className="text-2xl">{s.game.icon || '🎮'}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.game.name}</div>
                  {s.game.description && <div className="truncate text-xs text-slate-500">{s.game.description}</div>}
                  <div className="text-xs text-slate-400">{s.status === 'IN_PROGRESS' ? 'In progress' : 'Ready to play'}</div>
                </div>
                <button
                  onClick={() => setPlaying({ session: s, kind: s.kind })}
                  className="shrink-0 rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  {s.status === 'IN_PROGRESS' ? 'Resume' : 'Play'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-500">Shop - buy a play</h4>
        {shop.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing published yet.</p>
        ) : (
          // Same treatment as the deck's own cards - icon, name, description,
          // nothing else, every tile the same size so they float evenly in
          // the grid. Prices/difficulty live one tap deeper, in the modal.
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shop.map((g) => (
              <li key={g.id} className="aspect-square">
                <button
                  onClick={() => setViewing(g)}
                  className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl border bg-white p-3 text-center hover:bg-slate-50"
                >
                  <span className="text-4xl">{g.miniGame.icon || '🎮'}</span>
                  <span className="line-clamp-1 text-sm font-semibold">{g.miniGame.name}</span>
                  {g.miniGame.description && <span className="line-clamp-2 text-xs text-slate-500">{g.miniGame.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing && <GameDetailModal game={viewing} tokenIcon={tokenIcon} onClose={() => setViewing(null)} onBuy={buy} />}
    </div>
  );
}
