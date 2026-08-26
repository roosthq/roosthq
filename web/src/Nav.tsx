import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { api, pluralize, familyFeatureEnabled, NOTIFICATIONS_CHANGED_EVENT, type Me, type DisplayConfig, type FamilySettings, type MyPresence } from './api';
import { myLocationIds, displaysForLocations } from './displayScope';
import Logo from './Logo';
import ResponsiveDropdown from './ResponsiveDropdown';
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
  function renderPresenceButton(size: number) {
    if (!presence) return null;
    return (
      <button
        onClick={() => setPresenceOpen(true)}
        title="Set where you are"
        className="flex items-center gap-1 rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <LucideIcon name={presenceIcon[presence.status].icon} slot={presenceIcon[presence.status].slot} size={size} />
        <span className="hidden sm:inline">{presenceIcon[presence.status].label}</span>
      </button>
    );
  }

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
  // Fixed-px LucideIcon glyphs, not raw emoji text - an emoji character
  // scales with the account's font-size setting (Settings -> Accessibility,
  // 14/16/19/22px root) same as any other text, while its sibling icons
  // (already LucideIcon elsewhere in this bar) don't - at the larger sizes
  // that mismatch is exactly what made "increase text size" break the mobile
  // header (one emoji ballooning past its own tap-target box while its
  // neighbors stayed put). A function (not a plain element) so the mobile
  // header row can render it bigger than the desktop bar without a second
  // near-duplicate copy of the markup.
  function renderSearchLink(size: number) {
    return (
      <NavLink
        to="/search"
        onClick={() => setMenuOpen(false)}
        className="flex items-center justify-center rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        title="Search"
      >
        <LucideIcon name="search" size={size} />
      </NavLink>
    );
  }
  function renderBell(size: number) {
    return (
      <NavLink
        to="/notifications"
        onClick={() => setMenuOpen(false)}
        className="relative flex items-center justify-center rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        title="Notifications"
      >
        <LucideIcon name="bell" size={size} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </NavLink>
    );
  }
  // Same pill treatment as GhostQuickSwitcher's trigger below - a plain-text
  // link sitting right next to it with no border/background of its own read
  // as one merged "Display Ghost" phrase instead of two separate controls.
  const navPillCls = 'rounded border px-2 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800';
  const displayLink =
    myDisplays.length > 1 ? (
      <ResponsiveDropdown trigger="Display ↗" title="Display" panelClassName="w-48" triggerClassName={navPillCls}>
        {myDisplays.map((d) => (
          <a
            key={d.id}
            href={`/?display=1&config=${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border px-4 py-3 text-base font-medium hover:bg-slate-50 sm:rounded sm:border-0 sm:px-2 sm:py-1 sm:text-sm sm:font-normal sm:text-slate-600 sm:hover:bg-slate-100"
          >
            {d.name}
          </a>
        ))}
      </ResponsiveDropdown>
    ) : (
      <a
        href={myDisplays.length === 1 ? `/?display=1&config=${myDisplays[0].id}` : '/?display=1'}
        target="_blank"
        rel="noreferrer"
        className={navPillCls}
      >
        Display ↗
      </a>
    );

  // Name -> dropdown: "View Profile" (the basic, browse-anyone page) vs
  // "My Account" (identity/password/avatar/PIN/Google/delete - self only).
  //
  // Alignment only matters for the desktop popover (ResponsiveDropdown
  // always uses a full-width bottom sheet below sm) - the desktop copy sits
  // at the far right of the nav bar (right-0 fits), the mobile-hamburger
  // copy sits at the far left of its row instead (left-0).
  // Bigger and actually bordered on a phone (this renders inside a
  // full-width BottomSheet there, with no hover state to lean on to show
  // it's tappable) - shrinks back to a compact hover-only row for the
  // desktop popover, same split as GhostQuickSwitcher's list items.
  const menuItemCls =
    'block w-full rounded-lg border px-4 py-3 text-left text-base font-medium hover:bg-slate-50 sm:rounded sm:border-0 sm:px-2 sm:py-1 sm:text-sm sm:font-normal sm:text-slate-600 sm:hover:bg-slate-100';

  function nameMenu(closeMenu: boolean) {
    return (
      <ResponsiveDropdown
        trigger={`${me.displayName} ▾`}
        title="Account"
        align={closeMenu ? 'left' : 'right'}
        panelClassName="w-48"
        triggerClassName={navPillCls}
      >
        {(close) => {
          function go() {
            close();
            if (closeMenu) setMenuOpen(false);
          }
          return (
            <>
              <Link to="/profile" onClick={go} className={menuItemCls}>
                View Profile
              </Link>
              <Link to="/my-settings" onClick={go} className={menuItemCls}>
                My Account
              </Link>
              {/* Sign out lives here, not as its own top-level nav item -
                  it's an account action, and folding it in means one less
                  bare-text control competing for attention in the header. */}
              <div className="my-1 border-t sm:my-0.5" />
              <button
                onClick={() => {
                  go();
                  onLogout();
                }}
                className={menuItemCls}
              >
                Sign out
              </button>
            </>
          );
        }}
      </ResponsiveDropdown>
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
  // text-xs (rem-based), not the old text-[11px]: a fixed-px size is deaf to
  // the account's font-size setting while everything around it (and the
  // icon-vs-label balance) grows, so at "lg"/"xl" these labels used to end up
  // relatively tinier the more legible the rest of the app got - exactly
  // backwards. min-h-14 keeps the whole tab a real ≥44px touch target even
  // though the label text itself only takes up part of that height.
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-1.5 text-xs ${isActive ? 'font-semibold text-slate-800' : 'text-slate-500'}`;
  const bottomTabs = (
    <div className="bottom-tabs fixed inset-x-0 bottom-0 z-40 flex border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <NavLink to="/" end className={tabCls}>
        <LucideIcon name="calendar" slot="nav.calendar" size={24} />Calendar
      </NavLink>
      {choresOn && (
        <NavLink to="/chores" className={tabCls}>
          <LucideIcon name="check-square" slot="nav.chores" size={24} />{chorePlural}
        </NavLink>
      )}
      {storeOn && (
        <NavLink to="/store" className={tabCls}>
          <LucideIcon name="shopping-bag" slot="nav.store" size={24} />Store
        </NavLink>
      )}
      <NavLink to="/profile" className={tabCls}>
        <LucideIcon name="user" slot="nav.profiles" size={24} />Profiles
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
        {/* Three visually distinct groups (icon utilities / secondary
            links / account) separated by real dividers, not just gap - a
            row of same-weight plain-text and icon buttons with nothing but
            whitespace between them read as one run-on control ("Display
            Ghost Casey Shea ▾" looked like a single mangled label). */}
        <div className="hidden items-center gap-1 text-sm lg:flex">
          <div className="flex items-center gap-1">
            {renderSearchLink(18)}
            {renderBell(18)}
            <PendingIndicator me={me} />
            <PendingGamesIndicator tokenName={family?.tokenName ?? 'tokens'} />
            {renderPresenceButton(16)}
            <button onClick={onToggleTheme} title="Toggle light/dark" className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <LucideIcon name={me.themePref === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          </div>
          <span className="mx-2 h-5 border-l" aria-hidden="true" />
          <div className="flex items-center gap-1.5">
            {displayLink}
            {canGhost && <GhostQuickSwitcher me={me} triggerClassName={navPillCls} />}
          </div>
          <span className="mx-2 h-5 border-l" aria-hidden="true" />
          {/* Sign out lives inside this dropdown now - see nameMenu. */}
          {nameMenu(false)}
        </div>

        {/* Mobile header row: same controls as the desktop bar, deliberately
            bigger (24px icons, ~44px+ tap targets) - this is the row the user
            actually has to read/tap on a phone, so it gets the size bump the
            plan called for instead of inheriting the desktop bar's compact
            sizing. */}
        <div className="flex items-center gap-0.5 lg:hidden">
          {renderSearchLink(24)}
          {renderBell(24)}
          <PendingIndicator me={me} size="lg" />
          <PendingGamesIndicator tokenName={family?.tokenName ?? 'tokens'} size="lg" />
          {renderPresenceButton(22)}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="rounded p-2 text-slate-600 hover:bg-slate-100"
          >
            <LucideIcon name={menuOpen ? 'x' : 'menu'} size={26} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mt-3 space-y-3 border-t pt-3 lg:hidden">
          <div className="flex flex-col gap-1">{links}</div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-base">
            <button
              onClick={onToggleTheme}
              title="Toggle light/dark"
              className="flex items-center gap-1.5 rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <LucideIcon name={me.themePref === 'dark' ? 'sun' : 'moon'} size={20} />
              {me.themePref === 'dark' ? 'Light' : 'Dark'}
            </button>
            {displayLink}
            {canGhost && <GhostQuickSwitcher me={me} align="left" triggerClassName={navPillCls} />}
          </div>
          <div className="border-t pt-3 text-sm">{nameMenu(true)}</div>
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
