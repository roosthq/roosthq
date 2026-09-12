import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, type Me } from './api';
import TokenBadge from './TokenBadge';

// Kid View's whole app shell (KidApp.tsx) replaces the adult Nav with this -
// Casey's own instruction 2026-09-12, after kid feedback that the main app
// reads as too complicated: a handful of giant icon-first destinations
// instead of a long text menu (Calendar/Chores/Store/Household/Profile/
// Search/Notifications/Settings). Fixed to the BOTTOM (thumb reach on a
// phone/tablet, same reasoning as Modal's own safe-area padding), a tiny
// top strip carries only identity + balance - nothing to tap there but the
// avatar, which goes to Profile.
export interface KidTab {
  to: string;
  icon: string;
  label: string;
}

export default function KidNav({ me, tokenIcon, tabs }: { me: Me; tokenIcon: string; tabs: KidTab[] }) {
  const location = useLocation();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .tokenBalance(me.id)
      .then((b) => {
        if (alive) setBalance(b.balance);
      })
      .catch(() => {
        if (alive) setBalance(null);
      });
    return () => {
      alive = false;
    };
    // Re-checked on every tab switch, not just once - the kid nav is
    // mounted for the whole session, so a purchase or a chore approval
    // elsewhere wouldn't otherwise show up here until a full reload.
  }, [me.id, location.pathname, location.search]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          {me.avatar ? (
            <img src={me.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500">
              {me.displayName.charAt(0)}
            </div>
          )}
          <span className="text-lg font-bold">Hi, {me.displayName.split(' ')[0]}!</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/profile" aria-label="My profile">
            {balance !== null && <TokenBadge icon={tokenIcon} amount={balance} size="lg" />}
          </Link>
          {/* Kid View's only route to My Settings (theme/font size/sign
              out) - everything else there is adult-only account stuff, but
              those three still need to be reachable from somewhere. */}
          <Link to="/my-settings" aria-label="Settings" className="text-xl text-slate-400">
            ⚙️
          </Link>
        </div>
      </header>

      {/* Manual active-match on pathname+search, not NavLink's own isActive -
          Store/Play/Learn all route to /store with a different ?tab=, which
          NavLink can't tell apart by path alone. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-white pb-[env(safe-area-inset-bottom)]"
        style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }}
      >
        {tabs.map((t) => {
          const [toPath, toQuery] = t.to.split('?');
          const isActive = location.pathname === toPath && (toQuery ?? '') === location.search.replace(/^\?/, '');
          return (
            <Link
              key={t.to}
              to={t.to}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold"
              style={isActive ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-muted, #64748b)' }}
            >
              <span className="text-2xl leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
