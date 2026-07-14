import { useCallback, useEffect, useState } from 'react';
import { prizeClient, type StorePrize, type PrizeClient } from './api';
import TokenBadge from './TokenBadge';
import { TYPE_TAG, PrizeImage, PrizeDetailModal } from './Prize';

type Actor = { id: string; role: string; displayName: string };

// Kiosk-only prize browsing + redeeming — adding/editing prizes stays on the
// normal portal (adults use StorePage for that); this is deliberately a
// read-and-redeem-only view for whoever's signed into the touch display.
export default function PrizesPanel({ me, client: clientProp }: { me: Actor; client?: PrizeClient }) {
  const client = clientProp ?? prizeClient();
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [balance, setBalance] = useState(0);
  const [tokenName, setTokenName] = useState('Tokens');
  const [tokenIcon, setTokenIcon] = useState('🪙');
  const [viewing, setViewing] = useState<StorePrize | null>(null);

  const refresh = useCallback(async () => {
    const [p, b] = await Promise.all([client.prizes(), client.tokenBalance(me.id)]);
    setPrizes(p);
    setBalance(b.balance);
  }, [client, me.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    client.familySettings().then((s) => {
      setTokenName(s.tokenName);
      setTokenIcon(s.tokenIcon);
    }).catch(() => undefined);
  }, [client]);

  async function redeem(p: StorePrize) {
    if (balance < p.tokenCost) return;
    if (!window.confirm(`Spend ${p.tokenCost} ${tokenName} on "${p.name}"?`)) return;
    try {
      await client.redeemPrize(p.id);
      setViewing(null);
      await refresh();
    } catch {
      alert('Could not redeem — not enough ' + tokenName + '?');
    }
  }

  return (
    <section className="mt-4">
      <h2 className="text-lg font-bold tracking-tight">Store</h2>
      <div className="mt-2">
        <TokenBadge icon={tokenIcon} amount={balance} label={tokenName} size="lg" />
      </div>
      <ul className="mt-3 space-y-2">
        {prizes.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setViewing(p)}
              className="flex w-full items-center gap-2 rounded-lg border bg-white p-2 text-left hover:shadow-sm"
            >
              <PrizeImage src={p.image} alt={p.name} className="h-10 w-10 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className={`text-xs ${TYPE_TAG[p.type].className}`}>
                  {TYPE_TAG[p.type].icon} {TYPE_TAG[p.type].label}
                </span>
              </span>
              <TokenBadge icon={tokenIcon} amount={p.tokenCost} />
            </button>
          </li>
        ))}
        {prizes.length === 0 && <li className="text-sm text-slate-400">Nothing in the store yet.</li>}
      </ul>

      {viewing && (
        <PrizeDetailModal
          prize={viewing}
          tokenName={tokenName}
          tokenIcon={tokenIcon}
          isAdult={false}
          balance={balance}
          onClose={() => setViewing(null)}
          onRedeem={() => redeem(viewing)}
        />
      )}
    </section>
  );
}
