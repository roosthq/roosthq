import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { api, pluralize, NOTIFICATIONS_CHANGED_EVENT, type Me, type FontSize, type DisplayConfig } from './api';
import { myLocationIds, displaysForLocations } from './displayScope';
import Logo from './Logo';
import DropdownDetails from './DropdownDetails';
import PendingIndicator from './PendingIndicator';

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
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
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

  // Below lg (i.e. phones and portrait tablets), the full link row + controls
  // row don't fit - they used to just wrap onto a tall stack of half-legible
  // lines. Collapse into a hamburger menu instead.
  const [menuOpen, setMenuOpen] = useState(false);
  const searchLink = (
    <NavLink to="/search" onClick={() => setMenuOpen(false)} className="text-slate-500 hover:text-slate-800" title="Search">
      🔍
    </NavLink>
  );
  const bell = (
    <NavLink
      to="/notifications"
      onClick={() => setMenuOpen(false)}
      className="relative text-slate-500 hover:text-slate-800"
      title="Notifications"
    >
      🔔
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </NavLink>
  );
  const displayLink =
    myDisplays.length > 1 ? (
      <DropdownDetails summary="Display ↗">
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
      </DropdownDetails>
    ) : (
      <a
        href={myDisplays.length === 1 ? `/?display=1&config=${myDisplays[0].id}` : '/?display=1'}
        target="_blank"
        rel="noreferrer"
        className="text-slate-500 hover:text-slate-800"
      >
        Display ↗
      </a>
    );

  // Name -> dropdown: "View Profile" (the basic, browse-anyone page) vs
  // "My Settings" (identity/password/avatar/PIN/Google/delete - self only).
  // Same <details>/<summary> disclosure shell as displayLink above.
  //
  // Alignment differs by where this gets mounted: the desktop copy sits at
  // the far right of the nav bar (right-0, panel opens leftward - fits), but
  // the mobile copy sits at the far LEFT of its row (name on the left,
  // "Sign out" on the right) - right-0 there anchored the panel's right edge
  // to that tiny summary, pushing its left edge off the left of the screen
  // entirely. left-0 for that one instead.
  function nameMenu(closeMenu: boolean) {
    return (
      <DropdownDetails summary={`${me.displayName} ▾`}>
        <div className={`absolute ${closeMenu ? 'left-0' : 'right-0'} z-10 mt-1 w-40 rounded border bg-white p-1 shadow`}>
          <Link
            to="/profile"
            onClick={closeMenu ? () => setMenuOpen(false) : undefined}
            className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            View Profile
          </Link>
          <Link
            to="/my-settings"
            onClick={closeMenu ? () => setMenuOpen(false) : undefined}
            className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            My Settings
          </Link>
        </div>
      </DropdownDetails>
    );
  }

  const links = (
    <>
      {isAdult && <NavLink to="/dashboard" className={cls} onClick={() => setMenuOpen(false)}>Dashboard</NavLink>}
      <NavLink to="/" end className={cls} onClick={() => setMenuOpen(false)}>Calendar</NavLink>
      <NavLink to="/agenda" className={cls} onClick={() => setMenuOpen(false)}>Agenda</NavLink>
      <NavLink to="/chores" className={cls} onClick={() => setMenuOpen(false)}>{chorePlural}</NavLink>
      <NavLink to="/store" className={cls} onClick={() => setMenuOpen(false)}>Store</NavLink>
      <NavLink to="/profile" className={cls} onClick={() => setMenuOpen(false)}>Profiles</NavLink>
      <NavLink to="/household" className={cls} onClick={() => setMenuOpen(false)}>Household</NavLink>
      <NavLink to="/rules" className={cls} onClick={() => setMenuOpen(false)}>Rules</NavLink>
      {isAdult && <NavLink to="/awards" className={cls} onClick={() => setMenuOpen(false)}>Awards</NavLink>}
      {isAdult && <NavLink to="/settings" className={cls} onClick={() => setMenuOpen(false)}>Settings</NavLink>}
    </>
  );

  // Phone/tablet: the four everyday destinations live in a fixed bottom tab
  // bar (thumb-reachable, kid-findable); the hamburger keeps the long tail
  // (Rules, Awards, Settings, theme, sign out). index.css pads the body via
  // body:has(.bottom-tabs) so page content never hides behind it - the kiosk
  // renders no Nav, so it gets no padding.
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-slate-800' : 'text-slate-500'}`;
  const bottomTabs = (
    <div className="bottom-tabs fixed inset-x-0 bottom-0 z-40 flex border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      {/* Adults get Dashboard in the first (most reachable) slot instead of
          Calendar - Calendar is still one tap away from there, and still has
          its own nav link, just no longer the default landing spot. Kids
          keep Calendar here since they have no Dashboard. */}
      {isAdult ? (
        <NavLink to="/dashboard" className={tabCls}>
          <span className="text-xl leading-none">📊</span>Dashboard
        </NavLink>
      ) : (
        <NavLink to="/" end className={tabCls}>
          <span className="text-xl leading-none">📅</span>Calendar
        </NavLink>
      )}
      <NavLink to="/chores" className={tabCls}>
        <span className="text-xl leading-none">✅</span>{chorePlural}
      </NavLink>
      <NavLink to="/store" className={tabCls}>
        <span className="text-xl leading-none">🛍️</span>Store
      </NavLink>
      <NavLink to="/profile" className={tabCls}>
        <span className="text-xl leading-none">👤</span>Profiles
      </NavLink>
    </div>
  );

  return (
    <nav className="no-print border-b px-4 py-3 sm:px-6">
      {bottomTabs}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link to={isAdult ? '/dashboard' : '/'} className="mr-2 sm:mr-3 hover:opacity-80">
            <Logo size={26} />
          </Link>
          <div className="hidden flex-wrap items-center gap-1 lg:flex">{links}</div>
        </div>
        <div className="hidden items-center gap-3 text-sm lg:flex">
          {searchLink}
          {bell}
          <PendingIndicator me={me} />
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
          {displayLink}
          {nameMenu(false)}
          <button onClick={onLogout} className="text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        </div>

        <div className="flex items-center gap-3 lg:hidden">
          {searchLink}
          {bell}
          <PendingIndicator me={me} />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="rounded p-1 text-2xl leading-none text-slate-600 hover:bg-slate-100"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mt-3 space-y-3 border-t pt-3 lg:hidden">
          <div className="flex flex-col gap-1">{links}</div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
            <button onClick={onToggleTheme} title="Toggle light/dark" className="text-slate-500 hover:text-slate-800">
              {me.themePref === 'dark' ? '☀︎ Light' : '☾ Dark'}
            </button>
            <select
              value={me.fontSizePref ?? 'md'}
              onChange={(e) => onChangeFontSize(e.target.value as FontSize)}
              title="Text size"
              className="rounded border bg-transparent px-1 py-1.5 text-xs text-slate-500"
            >
              <option value="sm">Small text</option>
              <option value="md">Normal text</option>
              <option value="lg">Large text</option>
              <option value="xl">Extra large text</option>
            </select>
            {displayLink}
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            {nameMenu(true)}
            <button onClick={onLogout} className="text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
