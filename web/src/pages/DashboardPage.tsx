import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DATA_REFRESH_EVENT, type Chore, type Redemption, type Me } from '../api';
import { celebrate } from '../celebrate';
import TokenBadge from '../TokenBadge';

// Adult+ landing page - what the header logo and the mobile bottom tab's
// first slot both point to now, replacing Calendar in that role (Calendar
// keeps its own nav link and tab, just isn't the default landing spot
// anymore). Kids never reach this route (App.tsx redirects them to /).
export default function DashboardPage({ me }: { me: Me }) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const refresh = useCallback(() => {
    api.chores().then(setChores).catch(() => setChores([]));
    api.redemptions({}).then(setRedemptions).catch(() => setRedemptions([]));
  }, []);

  useEffect(() => {
    refresh();
    // Same lightweight "no SSE on the main portal" pattern PendingIndicator
    // uses in the header - a poll plus the shared refresh event.
    const id = setInterval(refresh, 60_000);
    window.addEventListener(DATA_REFRESH_EVENT, refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener(DATA_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  const pendingChores = chores.flatMap((c) => c.instances.filter((i) => i.status === 'PENDING').map((i) => ({ chore: c, instance: i })));
  const pendingRedemptions = redemptions.filter((r) => r.status === 'REQUESTED');
  const total = pendingChores.length + pendingRedemptions.length;

  async function act(fn: () => Promise<unknown>, el?: HTMLElement) {
    await fn();
    if (el) celebrate(el);
    refresh();
  }

  const quickLinks: Array<{ to: string; icon: string; label: string }> = [
    { to: '/chores', icon: '✅', label: 'Chores' },
    { to: '/store', icon: '🛍️', label: 'Store' },
    { to: '/', icon: '📅', label: 'Calendar' },
    { to: '/household', icon: '🏠', label: 'Household' },
    { to: '/rules', icon: '📋', label: 'Rules' },
    { to: '/awards', icon: '🏆', label: 'Awards' },
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <h2 className="text-lg font-semibold">Welcome back, {me.displayName.split(' ')[0]}</h2>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">
          {total > 0 ? `Pending approvals (${total})` : 'Pending approvals'}
        </h3>
        {total === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Nothing waiting on you right now.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {pendingChores.map(({ chore, instance }) => (
              <li key={instance.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{chore.title}</span>
                  {instance.claimedByUserId && <span className="text-slate-400"> - needs approval</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={(e) => act(() => api.approveInstance(instance.id), e.currentTarget)}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500"
                  >
                    Approve
                  </button>
                  <button onClick={() => act(() => api.rejectInstance(instance.id))} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    Reject
                  </button>
                </span>
              </li>
            ))}
            {pendingRedemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{r.user?.displayName ?? 'Someone'} wants </span>
                  {r.prize.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <TokenBadge icon="🪙" amount={r.prize.tokenCost} />
                  <button
                    onClick={() => act(() => api.fulfillRedemption(r.id))}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500"
                  >
                    Fulfilled
                  </button>
                  <button onClick={() => act(() => api.rejectRedemption(r.id))} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">Jump to</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="card-nested flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              <span className="text-lg">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
