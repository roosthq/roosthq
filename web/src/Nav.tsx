import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api, pluralize, NOTIFICATIONS_CHANGED_EVENT, type Me, type FontSize, type DisplayConfig } from './api';
import { myLocationIds, displaysForLocations } from './displayScope';
import Logo from './Logo';

export default function Nav({
  me,
  onLogout,
  onToggleTheme,
  onChangeFontSize,
}: {
  me: Me;
  onLogout: () => void;
  onToggleTheme: () => void;
  onChangeFontSize: (size: FontSize) => void;
}) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  // Which display(s) this specific person is scoped to, so "Display ↗" opens
  // straight to the right one instead of always the family's first/default.
  const [myDisplays, setMyDisplays] = useState<DisplayConfig[]>([]);
  useEffect(() => {
    Promise.all([api.locations(), api.listDisplays()])
      .then(([locs, disps]) => setMyDisplays(displaysForLocations(disps, myLocationIds(locs, me.id))))
      .catch(() => setMyDisplays([]));
  }, [me.id]);

  const [chorePlural, setChorePlural] = useState('Chores');
  useEffect(() => {
    api.familySettings().then((f) => setChorePlural(pluralize(f.choreWord))).catch(() => undefined);
  }, []);

  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let cancelled = false;
    function poll() {
      api.unreadNotificationCount().then((r) => !cancelled && setUnread(r.count)).catch(() => undefined);
    }
    poll();
    const id = setInterval(poll, 30_000);
    // NotificationsPage fires this the moment it marks something read, so the
    // badge doesn't wait for the next 30s poll (or a page refresh) to catch up.
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, poll);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, poll);
    };
  }, []);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-3">
          <Logo size={26} />
        </span>
        <NavLink to="/" end className={cls}>Calendar</NavLink>
        <NavLink to="/chores" className={cls}>{chorePlural}</NavLink>
        <NavLink to="/store" className={cls}>Store</NavLink>
        <NavLink to="/profile" className={cls}>Profiles</NavLink>
        {isAdult && <NavLink to="/settings" className={cls}>Settings</NavLink>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <NavLink to="/notifications" className="relative text-slate-500 hover:text-slate-800" title="Notifications">
          🔔
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </NavLink>
        <button onClick={onToggleTheme} title="Toggle light/dark" className="text-slate-500 hover:text-slate-800">
          {me.themePref === 'dark' ? '☀︎' : '☾'}
        </button>
        <select
          value={me.fontSizePref ?? 'md'}
          onChange={(e) => onChangeFontSize(e.target.value as FontSize)}
          title="Text size"
          className="rounded border bg-transparent px-1 py-0.5 text-xs text-slate-500"
        >
          <option value="sm">Small text</option>
          <option value="md">Normal text</option>
          <option value="lg">Large text</option>
          <option value="xl">Extra large text</option>
        </select>
        {myDisplays.length > 1 ? (
          <details className="relative">
            <summary className="cursor-pointer list-none text-slate-500 hover:text-slate-800">Display ↗</summary>
            <div className="absolute right-0 z-10 mt-1 w-48 rounded border bg-white p-1 shadow">
              {myDisplays.map((d) => (
                <a
                  key={d.id}
                  href={`/?display=1&config=${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                >
                  {d.name}
                </a>
              ))}
            </div>
          </details>
        ) : (
          <a
            href={myDisplays.length === 1 ? `/?display=1&config=${myDisplays[0].id}` : '/?display=1'}
            target="_blank"
            rel="noreferrer"
            className="text-slate-500 hover:text-slate-800"
          >
            Display ↗
          </a>
        )}
        <span className="text-slate-500">{me.displayName}</span>
        <button onClick={onLogout} className="text-slate-500 hover:text-slate-800">
          Sign out
        </button>
      </div>
    </nav>
  );
}
