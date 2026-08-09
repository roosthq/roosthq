import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { api, DATA_REFRESH_EVENT, NOTIFICATIONS_CHANGED_EVENT, type Me, type AppNotification } from '../api';
import { formatDateTime } from '../dateFormat';

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

// Push/email notification prefs moved to My Settings - this page is the
// feed/list only now.
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
    // A notification always means something changed server-side since it
    // was created - a new bonus wheel to spin, a redemption's status, an
    // approval. Wherever it's about to navigate may already be mounted
    // (e.g. /chores sitting open in another tab) and won't otherwise know.
    window.dispatchEvent(new Event(DATA_REFRESH_EVENT));
    if (n.link) navigate(n.link);
  }

  async function markAllRead() {
    await api.markAllNotificationsRead();
    await refresh();
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }

  return (
    <div>
      {/* Wraps rather than sharing one line: at 375px the toggle plus
          "Mark all read" does not fit beside the heading. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{view === 'family' ? 'Family activity' : 'Notifications'}</h2>
        <div className="flex flex-wrap items-center gap-2">
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
          {/* People could not find where to turn push/email on - deep-link to
              the exact section instead of making them hunt through settings. */}
          <Link to="/my-settings#notifications" className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            ⚙️ Notification settings
          </Link>
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
                <span className="mt-0.5 block text-xs text-slate-400">{formatDateTime(n.createdAt)}</span>
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
