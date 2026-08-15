import { useCallback, useEffect, useState } from 'react';
import { kidPermissionEnabled, prizeClient, type Member, type StorePrize, type PrizeClient } from './api';
import TokenBadge from './TokenBadge';
import { TYPE_TAG, PrizeImage, PrizeDetailModal } from './Prize';
import LucideIcon from './LucideIcon';
import { useDialog } from './Dialog';
import { SuggestPrizeModal } from './pages/StorePage';

type Actor = { id: string; role: string; displayName: string };

// Kiosk-only prize browsing + redeeming - adding/editing prizes stays on the
// normal portal (adults use StorePage for that); this is deliberately a
// read-and-redeem-only view for whoever's signed into the touch display.
export default function PrizesPanel({
  me,
  client: clientProp,
  refreshSignal,
  kioskToken,
  locationId,
}: {
  me: Actor;
  client?: PrizeClient;
  // Bump this (e.g. on an incoming live-update push) to force an immediate
  // refetch from outside - see ChoresPanel's identical prop for why.
  refreshSignal?: number;
  // Kiosk profile token - needed to file a wishlist request as this person.
  kioskToken?: string;
  // #9 - this kiosk's own location (even null, for an unscoped one) - lets
  // redeeming/requesting be blocked for HOME-at-a-different-house too, not
  // just away/vacation. Omitted entirely on the main app, where there's no
  // kiosk to be "not at".
  locationId?: string | null;
}) {
  const client = clientProp ?? prizeClient();
  const { alert, confirm } = useDialog();
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [balance, setBalance] = useState(0);
  const [tokenName, setTokenName] = useState('Tokens');
  const [tokenIcon, setTokenIcon] = useState('coins'); // Lucide name - see App.tsx tokenIcon comment
  const [viewing, setViewing] = useState<StorePrize | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [self, setSelf] = useState<Member | null>(null);
  // Wishlist requests aren't prizes yet: they have no cost and can't be
  // redeemed. The server already hides other people's, so anything suggested
  // here is this person's own - show it in its own "waiting" list instead of
  // mixed into the store at 0 tokens with a Redeem button.
  const storePrizes = prizes.filter((p) => !p.suggested);
  const myRequests = prizes.filter((p) => p.suggested);
  // kidPermissionEnabled defaults to true for anyone who isn't a KID (there's
  // nothing to gate for an adult) - fine for redeeming, but "request" only
  // makes sense as a kid asking an adult for something; without the role
  // check every adult+ on the kiosk saw a "+ Request a prize" button that
  // just... suggested a prize to themselves.
  const canRequest = me.role === 'KID' && kidPermissionEnabled(self, 'store');
  // A balance is meaningless for whoever this family doesn't run tokens for
  // (typically adults, but the same flag can be set per-kid too) - the
  // item's own price tag below is unaffected, that's the item's cost, not
  // this person's balance.
  const showBalance = !self?.tokensDisabled;
  // #9 - away/vacation blocks redeeming/requesting outright, quietly (see
  // Prize.tsx). HOME at a different house than THIS kiosk's own blocks too
  // (locationId prop) - prizes aren't location-scoped themselves, but the
  // kiosk they're being bought through is.
  const presenceBlocked = (() => {
    if (!self?.presenceStatus) return false;
    if (self.presenceStatus !== 'HOME') return true;
    return !!(locationId && self.presenceLocationId && self.presenceLocationId !== locationId);
  })();

  const refresh = useCallback(async () => {
    const [p, b] = await Promise.all([client.prizes(), client.tokenBalance(me.id)]);
    setPrizes(p);
    setBalance(b.balance);
  }, [client, me.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable per client; only refreshSignal should re-trigger this
  useEffect(() => {
    if (refreshSignal !== undefined) refresh();
  }, [refreshSignal]);

  useEffect(() => {
    client.familySettings().then((s) => {
      setTokenName(s.tokenName);
      setTokenIcon(s.tokenIcon);
    }).catch(() => undefined);
    // The unlock payload doesn't carry permission flags, so read them off the
    // member list to know whether this kid may request/redeem.
    client.listUsers().then((us) => setSelf(us.find((u) => u.id === me.id) ?? null)).catch(() => undefined);
  }, [client, me.id]);

  async function redeem(p: StorePrize) {
    if (balance < p.tokenCost) return;
    if (!(await confirm(`Spend ${p.tokenCost} ${tokenName} on "${p.name}"?`, { confirmLabel: 'Redeem' }))) return;
    try {
      await client.redeemPrize(p.id);
      setViewing(null);
      await refresh();
    } catch {
      await alert('Could not redeem - not enough ' + tokenName + '?');
    }
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Store</h2>
        {canRequest && (
          <button
            onClick={() => setSuggesting(true)}
            disabled={presenceBlocked}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800"
          >
            + Request a prize
          </button>
        )}
      </div>
      {showBalance && (
        <div className="mt-2">
          <TokenBadge icon={tokenIcon} amount={balance} label={tokenName} size="lg" />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {storePrizes.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setViewing(p)}
              className="flex w-full items-center gap-2 rounded-lg border bg-white p-2 text-left hover:shadow-sm"
            >
              <PrizeImage src={p.image} alt={p.name} className="h-10 w-10 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className={`flex items-center gap-1 text-xs ${TYPE_TAG[p.type].className}`}>
                  <LucideIcon name={TYPE_TAG[p.type].icon} slot={TYPE_TAG[p.type].slot} size={12} /> {TYPE_TAG[p.type].label}
                </span>
              </span>
              <TokenBadge icon={tokenIcon} amount={p.tokenCost} />
            </button>
          </li>
        ))}
        {storePrizes.length === 0 && <li className="text-sm text-slate-400">Nothing in the store yet.</li>}
      </ul>

      {myRequests.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">My requests</h3>
          <p className="text-xs text-slate-400">Waiting for an adult to review these.</p>
          <ul className="mt-2 space-y-1.5">
            {myRequests.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border bg-white p-2 text-sm">
                <PrizeImage src={p.image} alt={p.name} className="h-8 w-8 shrink-0 rounded" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-amber-600">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggesting && (
        <SuggestPrizeModal
          kioskToken={kioskToken}
          onClose={() => setSuggesting(false)}
          onSaved={async () => {
            setSuggesting(false);
            await refresh();
          }}
        />
      )}

      {viewing && (
        <PrizeDetailModal
          prize={viewing}
          tokenName={tokenName}
          tokenIcon={tokenIcon}
          isAdult={false}
          balance={balance}
          canRedeem={!viewing.suggested && kidPermissionEnabled(self, 'store')}
          presenceBlocked={presenceBlocked}
          onClose={() => setViewing(null)}
          onRedeem={() => redeem(viewing)}
        />
      )}
    </section>
  );
}
