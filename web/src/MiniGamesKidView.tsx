import { useEffect, useState } from 'react';
import { api, type MiniGamePlaySession, type PublishedMiniGameItem, type PoolEntry } from './api';
import MiniGamePlayer from './MiniGamePlayer';

function prizeSummary(pool: PoolEntry[]): string {
  return pool
    .map((p) => (p.kind === 'TOKENS' ? `${p.min}-${p.max} tokens` : p.kind === 'STREAK_FREEZE' ? `${p.min}-${p.max} freeze` : 'a prize'))
    .join(' · ');
}

// The kid-facing half of mini-games - pending queue (grants + bought-not-
// yet-played purchases) and the shop. Shared between the mobile Store tab
// (MiniGamesTab) and the kiosk's Prizes section (Display.tsx) - same
// component, `kioskToken` is the only thing that changes which session it
// acts on.
export default function MiniGamesKidView({ kioskToken }: { kioskToken?: string }) {
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
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Games waiting for you</h4>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing right now.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pending.map((s) => (
              <li key={s.kind + s.id} className="panel flex items-center gap-3 p-3">
                <div className="text-2xl">{s.game.icon || '🎮'}</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{s.game.name}</div>
                  <div className="text-xs text-slate-500">{s.status === 'IN_PROGRESS' ? 'In progress' : 'Ready to play'}</div>
                </div>
                <button onClick={() => setPlaying({ session: s, kind: s.kind })} className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">
                  {s.status === 'IN_PROGRESS' ? 'Resume' : 'Play'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Shop - buy a play</h4>
        {shop.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing published yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shop.map((g) => (
              <li key={g.id} className="panel p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xl">{g.miniGame.icon || '🎮'}</span>
                  <span className="font-semibold">{g.miniGame.name}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.tiers.map((t) => (
                    <div key={t.id} className="flex flex-col gap-1 rounded border p-2 text-xs">
                      <div className="font-semibold">{t.label}</div>
                      <div className="text-slate-500">{prizeSummary(t.poolJson)}</div>
                      <button onClick={() => buy(t.id)} className="mt-1 rounded bg-slate-800 px-2 py-1 text-white">
                        Buy for {t.priceTokens}
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
