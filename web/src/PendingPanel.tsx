import { useCallback, useEffect, useState } from 'react';
import type { Chore, ChoreClient, Member, PrizeClient, Redemption, StorePrize } from './api';
import { celebrate } from './celebrate';
import TokenBadge from './TokenBadge';
import { PrizeDetailModal } from './Prize';

// Kiosk-only, adult+ visible: everything currently waiting on a yes/no -
// chore completions pending approval, and prize redemption requests - in one
// glance-able list instead of hunting through the full chores/store views.
export default function PendingPanel({
  chores,
  client,
  prizeClient,
  members,
  tokenName,
  tokenIcon,
  refreshSignal,
  onChanged,
}: {
  chores: Chore[];
  client: ChoreClient;
  prizeClient: PrizeClient;
  members: Member[];
  tokenName: string;
  tokenIcon: string;
  refreshSignal?: number;
  onChanged: () => void;
}) {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [prizes, setPrizes] = useState<StorePrize[]>([]);

  const refresh = useCallback(() => {
    prizeClient.allRedemptions().then(setRedemptions).catch(() => setRedemptions([]));
    // Full prize records - a redemption's own copy is thin (name/cost/type
    // only), not enough to know what to actually go fulfill.
    prizeClient.prizes().then(setPrizes).catch(() => setPrizes([]));
  }, [prizeClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable per client; only refreshSignal should re-trigger this
  useEffect(() => {
    if (refreshSignal !== undefined) refresh();
  }, [refreshSignal]);

  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'Someone';

  const pendingChores = chores.flatMap((chore) =>
    chore.instances
      .filter((i) => i.status === 'PENDING')
      .map((instance) => ({ chore, instance })),
  );
  // Proof photo viewer: fetched on demand (list payloads only carry hasProof).
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proofImg, setProofImg] = useState<string | null>(null);
  async function viewProof(instanceId: string) {
    if (proofFor === instanceId) {
      setProofFor(null);
      setProofImg(null);
      return;
    }
    setProofFor(instanceId);
    setProofImg(null);
    const r = await client.proofImage(instanceId).catch(() => ({ image: null }));
    setProofImg(r.image);
  }
  const pendingRedemptions = redemptions.filter((r) => r.status === 'REQUESTED');
  const prizeById = (id: string) => prizes.find((p) => p.id === id);
  const [viewingPrize, setViewingPrize] = useState<StorePrize | null>(null);

  async function act(
    fn: () => Promise<unknown>,
    celebrateFrom?: HTMLElement,
    slot: string | ((result: unknown) => string) = 'notification',
  ) {
    const result = await fn();
    if (celebrateFrom) celebrate(celebrateFrom, typeof slot === 'function' ? slot(result) : slot);
    refresh();
    onChanged();
  }

  // See chores.service.ts - approve's response carries milestoneHit.
  const approveSlot = (r: unknown) => ((r as { milestoneHit?: boolean } | undefined)?.milestoneHit ? 'streakMilestone' : 'choreApproved');

  if (pendingChores.length === 0 && pendingRedemptions.length === 0) return null;

  return (
    <section className="alert-banner p-3">
      <h3 className="text-sm font-semibold">
        Pending ({pendingChores.length + pendingRedemptions.length})
      </h3>
      <ul className="mt-2 space-y-2">
        {pendingChores.map(({ chore, instance }) => (
          // flex-col, not a wrapping row: description gets its own full-
          // width line, actions always get their own line below it - a
          // long title next to badges/buttons used to force an ugly
          // mid-sentence wrap once the row ran out of horizontal room.
          <li key={instance.id} className="rounded border bg-white p-2 text-sm">
            <div className="break-words">
              <span className="font-medium">{chore.title}</span>
              {instance.claimedByUserId && <span className="text-slate-400"> · {memberName(instance.claimedByUserId)}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {instance.hasProof && (
                <button onClick={() => viewProof(instance.id)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  📷 {proofFor === instance.id ? 'Hide' : 'Photo'}
                </button>
              )}
              <TokenBadge icon={tokenIcon} amount={chore.tokenValue} />
              <button
                onClick={(e) => act(() => client.approveInstance(instance.id), e.currentTarget, approveSlot)}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500"
              >
                Approve
              </button>
              <button onClick={() => act(() => client.rejectInstance(instance.id))} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                Reject
              </button>
            </div>
            {proofFor === instance.id && (
              <div className="mt-1.5">
                {proofImg ? (
                  <img src={proofImg} alt="proof" className="max-h-64 w-full rounded border object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">Loading photo…</span>
                )}
              </div>
            )}
          </li>
        ))}
        {pendingRedemptions.map((r) => (
          <li key={r.id} className="rounded border bg-white p-2 text-sm">
            <div className="break-words">
              <span className="font-medium">{memberName(r.userId)}</span> wants{' '}
              {prizeById(r.prizeId) ? (
                // Link-style color, not underline - underline on text that
                // wraps to several lines draws a separate line under EACH
                // wrapped line, which reads as broken rather than as one
                // clickable name.
                <button onClick={() => setViewingPrize(prizeById(r.prizeId)!)} className="font-medium text-blue-600 hover:underline">
                  {r.prize.name}
                </button>
              ) : (
                r.prize.name
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <TokenBadge icon={tokenIcon} amount={r.prize.tokenCost} />
              <button
                onClick={(e) => act(() => prizeClient.fulfillRedemption(r.id), e.currentTarget, 'redemptionFulfilled')}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500"
              >
                Fulfilled
              </button>
              <button onClick={() => act(() => prizeClient.rejectRedemption(r.id))} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
      {viewingPrize && (
        <PrizeDetailModal
          prize={viewingPrize}
          tokenName={tokenName}
          tokenIcon={tokenIcon}
          isAdult
          balance={0}
          onClose={() => setViewingPrize(null)}
          onRedeem={() => undefined}
        />
      )}
    </section>
  );
}
