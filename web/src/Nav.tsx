import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { api, pluralize, familyFeatureEnabled, NOTIFICATIONS_CHANGED_EVENT, type Me, type DisplayConfig, type FamilySettings, type MyPresence } from './api';
import { myLocationIds, displaysForLocations } from './displayScope';
import Logo from './Logo';
import DropdownDetails from './DropdownDetails';
import GhostQuickSwitcher from './GhostQuickSwitcher';
import PendingIndicator from './PendingIndicator';
import PendingGamesIndicator from './PendingGamesIndicator';
import LucideIcon from './LucideIcon';
import PresenceModal from './PresenceModal';

export default function Nav({
  me,
  onLogout,
  onToggleTheme,
}: {
  me: Me;
  onLogout: () => void;
  onToggleTheme: () => void;
}) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  // Any adult, but only while not ALREADY ghosting - switching straight from
  // one ghost target to another isn't supported server-side (both ghost
  // paths re-assert a real adult role on the ACTING session, which a
  // ghosted-as-someone-else session no longer has); return first. Which
  // families/members show up (everyone's, vs. just this family's kids) is
  // GhostQuickSwitcher's own call based on me.role.
  const canGhost = isAdult && !me.ghostedBy;
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
  const [family, setFamily] = useState<FamilySettings | null>(null);
  useEffect(() => {
    api.familySettings().then((f) => {
      setChorePlural(pluralize(f.choreWord));
      setFamily(f);
    }).catch(() => undefined);
  }, []);
  const choresOn = familyFeatureEnabled(family, 'chores');
  // Store and Awards share one page (StorePage.tsx) - show the link if
  // either is on; which tab StorePage lands on is its own call.
  const storeOn = familyFeatureEnabled(family, 'store') || familyFeatureEnabled(family, 'awards');
  const householdOn = familyFeatureEnabled(family, 'household');

  // #9 - presence status. Re-fetched whenever `me.id` changes, which covers
  // both a real login and a ghost switch (Nav gets a fresh `me` either way).
  const [presence, setPresence] = useState<MyPresence | null>(null);
  const [presenceOpen, setPresenceOpen] = useState(false);
  useEffect(() => {
    api.presenceMine().then(setPresence).catch(() => setPresence(null));
  }, [me.id]);
  const presenceIcon: Record<string, { icon: string; slot: string; label: string }> = {
    HOME: { icon: 'house', slot: 'badge.presenceHome', label: 'Home' },
    AWAY: { icon: 'moon', slot: 'badge.presenceAway', label: 'Away' },
    VACATION: { icon: 'plane', slot: 'badge.presenceVacation', label: 'Vacation' },
  };
  const myPresenceButton = presence && (
    <button
      onClick={() => setPresenceOpen(true)}
      title="Set where you are"
      className="flex items-center gap-1 text-slate-500 hover:text-slate-800"
    >
      <LucideIcon name={presenceIcon[presence.status].icon} slot={presenceIcon[presence.status].slot} size={16} />
      <span className="hidden sm:inline">{presenceIcon[presence.status].label}</span>
    </button>
  );

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
  // "My Account" (identity/password/avatar/PIN/Google/delete - self only).
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
            My Account
          </Link>
        </div>
      </DropdownDetails>
    );
  }

  // Nav reorg (2026-08): one map for every role - Dashboard is gone
  // (PendingIndicator, right here in the nav bar, already covered its one
  // non-redundant job for every adult, on every page); Agenda/Rules/Awards
  // folded into Calendar/Household/Store as views/sections/tabs rather than
  // separate destinations. Settings renamed "Family Settings" to stop it
  // reading as a near-duplicate of "My Account" (see nameMenu above).
  const links = (
    <>
      <NavLink to="/" end className={cls} onClick={() => setMenuOpen(false)}>Calendar</NavLink>
      {choresOn && <NavLink to="/chores" className={cls} onClick={() => setMenuOpen(false)}>{chorePlural}</NavLink>}
      {storeOn && <NavLink to="/store" className={cls} onClick={() => setMenuOpen(false)}>Store</NavLink>}
      {householdOn && <NavLink to="/household" className={cls} onClick={() => setMenuOpen(false)}>Household</NavLink>}
      <NavLink to="/profile" className={cls} onClick={() => setMenuOpen(false)}>Profiles</NavLink>
      {isAdult && <NavLink to="/settings" className={cls} onClick={() => setMenuOpen(false)}>Family Settings</NavLink>}
    </>
  );

  // Phone/tablet: the four everyday destinations live in a fixed bottom tab
  // bar (thumb-reachable, kid-findable), identical for every role now that
  // Dashboard is gone; the hamburger keeps the long tail (Household,
  // Settings, theme, sign out). index.css pads the body via
  // body:has(.bottom-tabs) so page content never hides behind it - the kiosk
  // renders no Nav, so it gets no padding.
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-slate-800' : 'text-slate-500'}`;
  const bottomTabs = (
    <div className="bottom-tabs fixed inset-x-0 bottom-0 z-40 flex border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <NavLink to="/" end className={tabCls}>
        <LucideIcon name="calendar" slot="nav.calendar" size={20} />Calendar
      </NavLink>
      {choresOn && (
        <NavLink to="/chores" className={tabCls}>
          <LucideIcon name="check-square" slot="nav.chores" size={20} />{chorePlural}
        </NavLink>
      )}
      {storeOn && (
        <NavLink to="/store" className={tabCls}>
          <LucideIcon name="shopping-bag" slot="nav.store" size={20} />Store
        </NavLink>
      )}
      <NavLink to="/profile" className={tabCls}>
        <LucideIcon name="user" slot="nav.profiles" size={20} />Profiles
      </NavLink>
    </div>
  );

  return (
    <nav className="no-print border-b px-4 py-3 sm:px-6">
      {bottomTabs}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link to="/" className="mr-2 sm:mr-3 hover:opacity-80">
            <Logo size={26} />
          </Link>
          <div className="hidden flex-wrap items-center gap-1 lg:flex">{links}</div>
        </div>
        <div className="hidden items-center gap-3 text-sm lg:flex">
          {searchLink}
          {bell}
          <PendingIndicator me={me} />
          <PendingGamesIndicator tokenName={family?.tokenName ?? 'tokens'} />
          {myPresenceButton}
          <button onClick={onToggleTheme} title="Toggle light/dark" className="text-slate-500 hover:text-slate-800">
            {me.themePref === 'dark' ? '☀︎' : '☾'}
          </button>
          {displayLink}
          {canGhost && <GhostQuickSwitcher me={me} />}
          {nameMenu(false)}
          <button onClick={onLogout} className="text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        </div>

        <div className="flex items-center gap-3 lg:hidden">
          {searchLink}
          {bell}
          <PendingIndicator me={me} />
          <PendingGamesIndicator tokenName={family?.tokenName ?? 'tokens'} />
          {myPresenceButton}
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
            {displayLink}
            {canGhost && <GhostQuickSwitcher me={me} align="left" />}
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            {nameMenu(true)}
            <button onClick={onLogout} className="text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </div>
        </div>
      )}
      {presenceOpen && presence && (
        <PresenceModal
          displayName={me.displayName}
          current={presence}
          onSaved={(next) => {
            setPresence(next);
            setPresenceOpen(false);
          }}
          onClose={() => setPresenceOpen(false)}
        />
      )}
    </nav>
  );
}
