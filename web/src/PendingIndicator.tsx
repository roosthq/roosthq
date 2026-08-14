import { useCallback, useEffect, useState } from 'react';
import { api, DATA_REFRESH_EVENT, type Chore, type Redemption, type Me } from './api';
import { celebrate } from './celebrate';
import TokenBadge from './TokenBadge';
import DropdownDetails from './DropdownDetails';

// Everyone's own "what's waiting" - in the header, so it's reachable from
// any page, not just /chores. An adult gets the same approve/reject actions
// PendingPanel already has; a kid gets a read-only "still waiting on Casey"
// list (there is nothing for them to click here - the point is just being
// able to check, without hunting for the right page, whether their chore
// or prize request actually went through).
export default function PendingIndicator({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const [chores, setChores] = useState<Chore[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const refresh = useCallback(() => {
    api.chores().then(setChores).catch(() => setChores([]));
    // Just the recent-enough window for a "what's waiting" badge, not a
    // browsable history - no load-more here on purpose.
    api.redemptions(isAdult ? {} : { userId: me.id }).then((r) => setRedemptions(r.items)).catch(() => setRedemptions([]));
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

  async function act(fn: () => Promise<unknown>, el?: HTMLElement, slot: string | ((result: unknown) => string) = 'notification') {
    const result = await fn();
    if (el) celebrate(el, typeof slot === 'function' ? slot(result) : slot);
    refresh();
  }

  // See chores.service.ts - approve's response carries milestoneHit.
  const approveSlot = (r: unknown) => ((r as { milestoneHit?: boolean } | undefined)?.milestoneHit ? 'streakMilestone' : 'choreApproved');

  if (total === 0) return null;

  return (
    <DropdownDetails
      summary={`⏳ ${total}`}
      summaryClassName="cursor-pointer list-none rounded-full px-2.5 py-1 text-sm font-medium hover:bg-slate-100"
    >
      <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] rounded-lg border bg-white p-3 text-sm shadow-lg">
        <p className="mb-2 font-semibold">Pending ({total})</p>
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {pendingChores.map(({ chore, instance }) => (
            <li key={instance.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{chore.title}</span>
                {isAdult && instance.claimedByUserId && <span className="text-slate-400"> - needs approval</span>}
                {!isAdult && <span className="text-slate-400"> - waiting on an adult</span>}
              </span>
              {isAdult ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={(e) => act(() => api.approveInstance(instance.id), e.currentTarget, approveSlot)}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500"
                  >
                    Approve
                  </button>
                  <button onClick={() => act(() => api.rejectInstance(instance.id))} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    Reject
                  </button>
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-amber-600">⏳</span>
              )}
            </li>
          ))}
          {pendingRedemptions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span className="min-w-0 flex-1 truncate">
                {isAdult && <span className="font-medium">{r.user?.displayName ?? 'Someone'} wants </span>}
                <span className={isAdult ? '' : 'font-medium'}>{r.prize.name}</span>
                {!isAdult && <span className="text-slate-400"> - waiting on an adult</span>}
              </span>
              {isAdult ? (
                <span className="flex shrink-0 items-center gap-1">
                  <TokenBadge icon="coins" amount={r.prize.tokenCost} />
                  <button
                    onClick={(e) => act(() => api.fulfillRedemption(r.id), e.currentTarget, 'redemptionFulfilled')}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500"
                  >
                    Fulfilled
                  </button>
                  <button onClick={() => act(() => api.rejectRedemption(r.id))} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    Reject
                  </button>
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-amber-600">⏳</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </DropdownDetails>
  );
}
