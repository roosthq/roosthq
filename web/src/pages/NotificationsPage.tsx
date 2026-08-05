import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, NOTIFICATIONS_CHANGED_EVENT, type Me, type AppNotification } from '../api';
import { useDialog } from '../Dialog';
import { pushSupported, currentPushSubscription, subscribeToPush, unsubscribeFromPush } from '../push';

const TYPE_ICON: Record<string, string> = {
  CHORE_PENDING: '⏳',
  CHORE_APPROVED: '✅',
  CHORE_REJECTED: '↩️',
  CHORE_MISSED: '⚠️',
  CHORE_DUE_SOON: '⏰',
  STREAK_BONUS: '🔥',
  REDEMPTION_REQUESTED: '🎁',
  REDEMPTION_FULFILLED: '✅',
  REDEMPTION_REJECTED: '↩️',
  PRIZE_SUGGESTED: '💡',
  CALENDAR_EVENT_ADDED: '📅',
  CALENDAR_EVENT_REMINDER: '⏰',
  AWARD_GRANTED: '🏆',
};

function NotifySettings({ me }: { me: Me }) {
  const { alert } = useDialog();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailOn, setEmailOn] = useState(!!me.notifyByEmail);

  useEffect(() => {
    currentPushSubscription().then((s) => setPushOn(!!s)).catch(() => undefined);
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
      } else {
        await subscribeToPush();
        setPushOn(true);
      }
    } catch (e) {
      await alert((e as Error).message || 'Could not update push notifications.');
    } finally {
      setPushBusy(false);
    }
  }

  async function toggleEmail(next: boolean) {
    setEmailOn(next);
    await api.setNotifyByEmail(next).catch(() => setEmailOn(!next));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-slate-50 p-3 text-sm">
      {pushSupported() && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pushOn} disabled={pushBusy} onChange={togglePush} />
          Push notifications on this device
        </label>
      )}
      {me.email && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={emailOn} onChange={(e) => toggleEmail(e.target.checked)} />
          Also email me ({me.email})
        </label>
      )}
    </div>
  );
}

export default function NotificationsPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const [view, setView] = useState<'mine' | 'family'>('mine');
  const [items, setItems] = useState<AppNotification[]>([]);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setItems(await api.notifications(view === 'family'));
  }, [view]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function open(n: AppNotification) {
    if (!n.readAt) {
      await api.markNotificationRead(n.id);
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    }
    if (n.link) navigate(n.link);
  }

  async function markAllRead() {
    await api.markAllNotificationsRead();
    await refresh();
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }

  return (
    <div>
      <NotifySettings me={me} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{view === 'family' ? 'Family activity' : 'Notifications'}</h2>
        <div className="flex items-center gap-2">
          {isAdult && (
            <div className="flex rounded border text-sm">
              <button
                onClick={() => setView('mine')}
                className={`px-3 py-1 rounded-l ${view === 'mine' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
              >
                Mine
              </button>
              <button
                onClick={() => setView('family')}
                className={`px-3 py-1 rounded-r ${view === 'family' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
              >
                Everyone
              </button>
            </div>
          )}
          {view === 'mine' && (
            <button onClick={markAllRead} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              Mark all read
            </button>
          )}
        </div>
      </div>

      <ul className="mt-4 space-y-1">
        {items.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => open(n)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-slate-50 ${
                !n.readAt && view === 'mine' ? 'bg-slate-100' : 'bg-white'
              }`}
            >
              <span className="text-lg">{TYPE_ICON[n.type] ?? '🔔'}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm">
                  {view === 'family' && n.user && <strong className="font-medium">{n.user.displayName}: </strong>}
                  {n.title}
                </span>
                {n.body && <span className="mt-0.5 block text-xs text-slate-500">{n.body}</span>}
                <span className="mt-0.5 block text-xs text-slate-400">{new Date(n.createdAt).toLocaleString(undefined, { hour12: true })}</span>
              </span>
              {!n.readAt && view === 'mine' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-400">{view === 'family' ? 'No activity yet.' : "You're all caught up."}</li>
        )}
      </ul>
    </div>
  );
}
