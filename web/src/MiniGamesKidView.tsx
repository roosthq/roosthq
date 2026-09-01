import { useEffect, useState } from 'react';
import { api, type MiniGamePlaySession, type PublishedMiniGameItem, type PoolEntry } from './api';
import MiniGamePlayer from './MiniGamePlayer';
import TokenBadge from './TokenBadge';

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

// The kid-facing half of mini-games - pending queue (grants + bought-not-
// yet-played purchases) and the shop. Shared between the mobile Store tab
// (MiniGamesTab) and the kiosk's Prizes section (Display.tsx) - same
// component, `kioskToken` is the only thing that changes which session it
// acts on.
export default function MiniGamesKidView({ kioskToken, tokenIcon }: { kioskToken?: string; tokenIcon: string }) {
  const [pending, setPending] = useState<(MiniGamePlaySession & { kind: 'grant' | 'purchase' })[]>([]);
  const [shop, setShop] = useState<PublishedMiniGameItem[]>([]);
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
    await api.purchaseMiniGameTier(tierId, kioskToken);
    await refresh();
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
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shop.map((g) => (
              <li key={g.id} className="rounded border bg-white p-3">
                <div className="mb-2 flex items-start gap-2">
                  <span className="text-xl">{g.miniGame.icon || '🎮'}</span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{g.miniGame.name}</div>
                    {g.miniGame.description && <p className="text-xs text-slate-500">{g.miniGame.description}</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {g.tiers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded border p-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.label}</div>
                        <PoolBadges pool={t.poolJson} tokenIcon={tokenIcon} />
                      </div>
                      <button onClick={() => buy(t.id)} className="shrink-0 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                        Buy · {t.priceTokens}
                      </button>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
