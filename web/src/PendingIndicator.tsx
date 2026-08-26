import { useCallback, useEffect, useState } from 'react';
import { api, DATA_REFRESH_EVENT, type Chore, type Redemption, type StorePrize, type Me } from './api';
import { celebrate } from './celebrate';
import TokenBadge from './TokenBadge';
import DropdownDetails from './DropdownDetails';
import BottomSheet from './BottomSheet';
import useNarrowViewport from './useNarrowViewport';
import { PrizeDetailModal } from './Prize';
import LucideIcon from './LucideIcon';

// Everyone's own "what's waiting" - in the header, so it's reachable from
// any page, not just /chores. An adult gets the same approve/reject actions
// PendingPanel already has; a kid gets a read-only "still waiting on Casey"
// list (there is nothing for them to click here - the point is just being
// able to check, without hunting for the right page, whether their chore
// or prize request actually went through).
export default function PendingIndicator({ me, size = 'sm' }: { me: Me; size?: 'sm' | 'lg' }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const [chores, setChores] = useState<Chore[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [balance, setBalance] = useState(0);

  const refresh = useCallback(() => {
    api.chores().then(setChores).catch(() => setChores([]));
    // Just the recent-enough window for a "what's waiting" badge, not a
    // browsable history - no load-more here on purpose.
    api.redemptions(isAdult ? {} : { userId: me.id }).then((r) => setRedemptions(r.items)).catch(() => setRedemptions([]));
    // Full prize records (url/price/description) - a redemption's own copy
    // is thin (name/cost/type only), not enough to actually approve or
    // fulfill anything against. Fetched here too so the header dropdown can
    // pop the same detail view without sending someone hunting for it on
    // the Store page.
    if (isAdult) api.prizes().then(setPrizes).catch(() => setPrizes([]));
    api.tokenBalance().then((b) => setBalance(b.balance)).catch(() => undefined);
  }, [isAdult, me.id]);

  useEffect(() => {
    refresh();
    // No SSE on the main portal (only the kiosk has one) - a light poll plus
    // the same cross-page refresh signal notifications use keeps this from
    // ever being too stale to trust.
    const id = setInterval(refresh, 60_000);
    window.addEventListener(DATA_REFRESH_EVENT, refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener(DATA_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  const pendingChores = isAdult
    ? chores.flatMap((c) => c.instances.filter((i) => i.status === 'PENDING').map((i) => ({ chore: c, instance: i })))
    : chores.flatMap((c) =>
        c.instances
          .filter((i) => i.status === 'PENDING' && (i.claimedByUserId === me.id || c.assignmentType !== 'ANYONE'))
          .map((i) => ({ chore: c, instance: i })),
      );
  const pendingRedemptions = redemptions.filter((r) => r.status === 'REQUESTED');
  const total = pendingChores.length + pendingRedemptions.length;
  const prizeById = (id: string) => prizes.find((p) => p.id === id);
  const [viewingPrize, setViewingPrize] = useState<StorePrize | null>(null);

  // Proof photo viewer: fetched on demand (list payloads only carry hasProof) -
  // mirrors PendingPanel's (kiosk) version so an adult can see what a kid
  // actually did before approving from anywhere, not just the kiosk.
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
    const r = await api.proofImage(instanceId).catch(() => ({ image: null }));
    setProofImg(r.image);
  }

  async function act(fn: () => Promise<unknown>, el?: HTMLElement, slot: string | ((result: unknown) => string) = 'notification') {
    const result = await fn();
    if (el) celebrate(el, typeof slot === 'function' ? slot(result) : slot);
    refresh();
  }

  // See chores.service.ts - approve's response carries milestoneHit.
  const approveSlot = (r: unknown) => ((r as { milestoneHit?: boolean } | undefined)?.milestoneHit ? 'streakMilestone' : 'choreApproved');

  // Mobile redesign, phase 1: a popover anchored to this icon can run off
  // the edge of a narrow screen (the icon sits mid-header, not flush
  // against either edge) - a bottom sheet has no anchor to run off from.
  // Desktop keeps the existing DropdownDetails popover unchanged; there's
  // always been room for it there.
  const narrow = useNarrowViewport();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'chores' | 'store'>('all');
  const showChores = filter !== 'store';
  const showStore = filter !== 'chores';

  if (total === 0) return null;

  const list = (
    <ul className="space-y-2">
      {showChores &&
        pendingChores.map(({ chore, instance }) => (
            // flex-col, not a wrapping row: a long title next to badges/
            // buttons used to force an ugly mid-sentence wrap once the row
            // ran out of horizontal room - now the description always gets
            // its own full-width line, and actions always get their own
            // line below it, however long the title is.
            <li key={instance.id} className="rounded border p-2">
              <div className="break-words">
                <span className="font-medium">{chore.title}</span>
                {isAdult && instance.claimedByUserId && <span className="text-slate-400"> - needs approval</span>}
                {!isAdult && <span className="text-slate-400"> - waiting on an adult</span>}
              </div>
              {isAdult ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {instance.hasProof && (
                    <button onClick={() => viewProof(instance.id)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                      📷 {proofFor === instance.id ? 'Hide' : 'Photo'}
                    </button>
                  )}
                  <button
                    onClick={(e) => act(() => api.approveInstance(instance.id), e.currentTarget, approveSlot)}
                    className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500"
                  >
                    Approve
                  </button>
                  <button onClick={() => act(() => api.rejectInstance(instance.id))} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                    Reject
                  </button>
                </div>
              ) : (
                <span className="text-xs font-medium text-amber-600">⏳</span>
              )}
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
      {showStore &&
        pendingRedemptions.map((r) => (
          <li key={r.id} className="rounded border p-2">
            <div className="break-words">
              {isAdult && <span className="font-medium">{r.user?.displayName ?? 'Someone'} wants </span>}
              {isAdult && prizeById(r.prizeId) ? (
                // A link-style color, not underline - underline on text
                // that wraps to several lines draws a separate line under
                // EACH wrapped line, which reads as broken/garbled rather
                // than as one clickable name (see Prize.tsx's own "View
                // product" link for the same convention).
                <button onClick={() => setViewingPrize(prizeById(r.prizeId)!)} className="font-medium text-blue-600 hover:underline">
                  {r.prize.name}
                </button>
              ) : (
                <span className={isAdult ? '' : 'font-medium'}>{r.prize.name}</span>
              )}
              {!isAdult && <span className="text-slate-400"> - waiting on an adult</span>}
            </div>
            {isAdult ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <TokenBadge icon="coins" amount={r.tokensSpent} />
                <button
                  onClick={(e) => act(() => api.fulfillRedemption(r.id), e.currentTarget, 'redemptionFulfilled')}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500"
                >
                  Fulfilled
                </button>
                <button onClick={() => act(() => api.rejectRedemption(r.id))} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
                  Reject
                </button>
              </div>
            ) : (
              <span className="text-xs font-medium text-amber-600">⏳</span>
            )}
          </li>
        ))}
    </ul>
  );

  const filterTabs = (
    <div className="mb-3 flex gap-1.5">
      {(
        [
          ['all', `All (${total})`],
          ['chores', `Chores (${pendingChores.length})`],
          ['store', `Store (${pendingRedemptions.length})`],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setFilter(key)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            filter === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const trigger = (
    <span className="inline-flex items-center gap-1">
      <LucideIcon name="hourglass" size={size === 'lg' ? 22 : 14} /> {total}
    </span>
  );
  const triggerCls =
    size === 'lg'
      ? 'cursor-pointer list-none rounded-full px-3 py-2 text-base font-medium hover:bg-slate-100'
      : 'cursor-pointer list-none rounded-full px-2.5 py-1 text-sm font-medium hover:bg-slate-100';

  return (
    <>
      {narrow ? (
        <button onClick={() => setSheetOpen(true)} className={triggerCls}>
          {trigger}
        </button>
      ) : (
        <DropdownDetails summary={trigger} summaryClassName={triggerCls}>
          <div className="absolute right-0 z-30 mt-2 w-96 max-w-[90vw] rounded-lg border bg-white p-3 text-sm shadow-lg">
            <p className="mb-2 font-semibold">Pending ({total})</p>
            {list}
          </div>
        </DropdownDetails>
      )}
      {narrow && (
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Pending (${total})`}>
          {pendingChores.length > 0 && pendingRedemptions.length > 0 && filterTabs}
          {list}
        </BottomSheet>
      )}
      {viewingPrize && (
        <PrizeDetailModal
          prize={viewingPrize}
          tokenName="Tokens"
          tokenIcon="coins"
          isAdult={isAdult}
          balance={balance}
          onClose={() => setViewingPrize(null)}
          onRedeem={() => undefined}
        />
      )}
    </>
  );
}
