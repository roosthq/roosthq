import { useCallback, useEffect, useState } from 'react';
import type { Chore, ChoreClient, Member, PrizeClient, Redemption } from './api';
import { celebrate } from './celebrate';
import TokenBadge from './TokenBadge';

// Kiosk-only, adult+ visible: everything currently waiting on a yes/no —
// chore completions pending approval, and prize redemption requests — in one
// glance-able list instead of hunting through the full chores/store views.
export default function PendingPanel({
  chores,
  client,
  prizeClient,
  members,
  tokenIcon,
  refreshSignal,
  onChanged,
}: {
  chores: Chore[];
  client: ChoreClient;
  prizeClient: PrizeClient;
  members: Member[];
  tokenIcon: string;
  refreshSignal?: number;
  onChanged: () => void;
}) {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const refresh = useCallback(() => {
    prizeClient.allRedemptions().then(setRedemptions).catch(() => setRedemptions([]));
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
  const pendingRedemptions = redemptions.filter((r) => r.status === 'REQUESTED');

  async function act(fn: () => Promise<unknown>, celebrateFrom?: HTMLElement) {
    await fn();
    if (celebrateFrom) celebrate(celebrateFrom);
    refresh();
    onChanged();
  }

  if (pendingChores.length === 0 && pendingRedemptions.length === 0) return null;

  return (
    <section className="rounded-lg border bg-amber-50 p-3">
      <h3 className="text-sm font-semibold text-amber-800">
        Pending ({pendingChores.length + pendingRedemptions.length})
      </h3>
      <ul className="mt-2 space-y-2">
        {pendingChores.map(({ chore, instance }) => (
          <li key={instance.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{chore.title}</span>
              {instance.claimedByUserId && <span className="text-slate-400"> · {memberName(instance.claimedByUserId)}</span>}
            </span>
            <TokenBadge icon={tokenIcon} amount={chore.tokenValue} />
            <button
              onClick={(e) => act(() => client.approveInstance(instance.id), e.currentTarget)}
              className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500"
            >
              Approve
            </button>
            <button onClick={() => act(() => client.rejectInstance(instance.id))} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
              Reject
            </button>
          </li>
        ))}
        {pendingRedemptions.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{memberName(r.userId)}</span> wants {r.prize.name}
            </span>
            <TokenBadge icon={tokenIcon} amount={r.prize.tokenCost} />
            <button
              onClick={() => act(() => prizeClient.fulfillRedemption(r.id))}
              className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500"
            >
              Fulfilled
            </button>
            <button onClick={() => act(() => prizeClient.rejectRedemption(r.id))} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
              Reject
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
