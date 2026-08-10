import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, loginUrl, pluralize, familyFeatureEnabled, type Me, type FamilySettings, type FontSize, type FamilyLocation } from './api';
import { myLocationIds } from './displayScope';
import LocationJoinModal from './LocationJoinModal';
import { setCelebrationSound } from './celebrate';
import Nav from './Nav';
import Logo from './Logo';
import LocalAuthForm from './LocalAuthForm';
import CalendarPage from './pages/CalendarPage';
import ChoresPage from './pages/ChoresPage';
import StorePage from './pages/StorePage';
import ProfilePage from './pages/ProfilePage';
import MySettingsPage from './pages/MySettingsPage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';
import HouseholdPage from './pages/HouseholdPage';
import SearchPage from './pages/SearchPage';

// data-mode = light/dark; data-theme = which of the 9 color themes (see
// COLOR_THEMES in api.ts). Two independent attributes - see index.css.
function applyMode(t: string) {
  document.documentElement.setAttribute('data-mode', t === 'dark' ? 'dark' : 'light');
}

function applyColorTheme(c: string) {
  document.documentElement.setAttribute('data-theme', c || 'meadow');
}

function applyFontSize(f: string) {
  document.documentElement.setAttribute('data-font-size', ['sm', 'lg', 'xl'].includes(f) ? f : 'md');
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [family, setFamily] = useState<FamilySettings | null>(null);
  const [locations, setLocations] = useState<FamilyLocation[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    try {
      const u = await api.me();
      setMe(u);
      applyMode(u.themePref ?? 'light');
      applyColorTheme(u.colorTheme ?? 'meadow');
      applyFontSize(u.fontSizePref ?? 'md');
      // Per-user chime preference for the main app; the kiosk (which never
      // renders App) sets this from its own display config instead.
      setCelebrationSound(u.soundEffects !== false);
      try {
        setFamily(await api.familySettings());
      } catch {
        /* ignore */
      }
      try {
        setLocations(await api.locations());
      } catch {
        setLocations([]);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function logout() {
    await api.logout();
    applyMode('light');
    applyColorTheme('meadow');
    applyFontSize('md');
    setMe(null);
  }

  async function toggleTheme() {
    if (!me) return;
    const next = me.themePref === 'dark' ? 'light' : 'dark';
    applyMode(next);
    setMe({ ...me, themePref: next });
    try {
      await api.setTheme(next);
    } catch {
      /* ignore */
    }
  }

  async function changeColorTheme(next: string) {
    if (!me) return;
    applyColorTheme(next);
    setMe({ ...me, colorTheme: next });
    try {
      await api.setColorTheme(next);
    } catch {
      /* ignore */
    }
  }

  // Identity fields (unlike theme/font-size above) can genuinely fail
  // validation (username taken, email required for this role) - no
  // optimistic update, no swallowed error; ProfilePage awaits this and
  // shows whatever it throws.
  async function updateProfile(patch: Partial<{ displayName: string; username: string | null; email: string | null; avatar: string | null }>) {
    if (!me) return;
    // Merge, don't replace: the server returns a plain User row, which has
    // no ghostedBy column (it's a session/JWT-only field, stamped in by
    // api.me() reading the cookie, not the DB) - replacing `me` outright
    // with that row silently ended the "Ghosting as X" banner on the next
    // identity/avatar edit, even though the underlying ghost session was
    // completely untouched. Same bug class as the OAuth-reconnect one fixed
    // server-side in auth.controller.ts; this was the client-side sibling.
    const updated = await api.updateProfile(patch);
    setMe((prev) => (prev ? { ...prev, ...updated } : updated));
  }

  async function changeFontSize(next: FontSize) {
    if (!me) return;
    applyFontSize(next);
    setMe({ ...me, fontSizePref: next });
    try {
      await api.setFontSize(next);
    } catch {
      /* ignore */
    }
  }

  if (loading) return <Centered>Loading…</Centered>;

  if (!me) {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const resetToken = params.get('resetToken');
    const needInvite = params.get('auth') === 'need_invite';
    const href = invite ? `${loginUrl}?invite=${encodeURIComponent(invite)}` : loginUrl;
    return (
      <Centered>
        <Logo size={64} />
        <p className="text-slate-500">The family&apos;s home base.</p>
        {invite && <p className="text-sm text-slate-600">You&apos;ve been invited to join a family.</p>}
        {needInvite && (
          <p className="max-w-sm text-center text-sm text-amber-600">
            That account isn&apos;t part of a family yet. Ask the family owner to send you an invite link.
          </p>
        )}
        {!resetToken && (
          <a href={href} className="mt-4 rounded-lg bg-slate-800 px-5 py-2.5 font-medium text-white hover:bg-slate-700">
            {invite ? 'Sign in with Google to join' : 'Sign in with Google'}
          </a>
        )}
        <LocalAuthForm
          inviteToken={invite}
          resetToken={resetToken}
          onLoggedIn={() => {
            setLoading(true);
            loadMe();
          }}
        />
      </Centered>
    );
  }

  const tokenName = family?.tokenName ?? 'Tokens';
  const tokenIcon = family?.tokenIcon ?? '🪙';
  const tokenValueUsd = family?.tokenValueUsd ?? 1;
  const choreWord = family?.choreWord ?? 'Chore';
  const chorePlural = pluralize(choreWord);
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const choresOn = familyFeatureEnabled(family, 'chores');
  // Store and Awards are independent features that share the /store route
  // (see StorePage.tsx) - the route itself only needs blocking if BOTH are
  // off; which tab shows is StorePage's own call.
  const storeRouteOn = familyFeatureEnabled(family, 'store') || familyFeatureEnabled(family, 'awards');
  const householdOn = familyFeatureEnabled(family, 'household');
  // Blocking: every role including kids, everywhere except the kiosk (which
  // never mounts App - see main.tsx) - if this family HAS locations, being
  // in none of them silently hides calendars/kiosk displays/scoped Household
  // items with no clue why, so it's not something to let slide unnoticed.
  const needsLocation = !!locations && locations.length > 0 && myLocationIds(locations, me.id).length === 0;

  async function returnToOwner() {
    await api.unghost();
    setLoading(true);
    await loadMe();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {needsLocation && (
        <LocationJoinModal locations={locations!} onJoined={() => api.locations().then(setLocations).catch(() => undefined)} />
      )}
      {me.ghostedBy && (
        <div className="no-print flex items-center justify-center gap-3 bg-purple-700 px-4 py-2 text-sm text-white">
          <span>
            👻 Ghosting as <strong>{me.displayName}</strong>
          </span>
          <button onClick={returnToOwner} className="rounded border border-white/40 px-2 py-0.5 hover:bg-white/10">
            Return to {me.ghostedBy.displayName}
          </button>
        </div>
      )}
      <Nav me={me} onLogout={logout} onToggleTheme={toggleTheme} onChangeFontSize={changeFontSize} />
      <main className="mx-auto max-w-5xl p-6">
        <Routes>
          <Route path="/" element={<CalendarPage me={me} />} />
          <Route path="/chores" element={choresOn ? <ChoresPage me={me} /> : <Navigate to="/" replace />} />
          <Route
            path="/store"
            element={storeRouteOn ? <StorePage me={me} tokenName={tokenName} tokenIcon={tokenIcon} tokenValueUsd={tokenValueUsd} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/profile"
            element={<ProfilePage me={me} tokenName={tokenName} tokenIcon={tokenIcon} chorePlural={chorePlural} />}
          />
          <Route
            path="/profile/:id"
            element={<ProfilePage me={me} tokenName={tokenName} tokenIcon={tokenIcon} chorePlural={chorePlural} />}
          />
          <Route
            path="/my-settings"
            element={
              <MySettingsPage me={me} onChangeColorTheme={changeColorTheme} onUpdateProfile={updateProfile} onLoggedOut={logout} />
            }
          />
          <Route path="/notifications" element={<NotificationsPage me={me} />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/household" element={householdOn ? <HouseholdPage me={me} /> : <Navigate to="/" replace />} />
          <Route path="/settings" element={isAdult ? <SettingsPage me={me} /> : <Navigate to="/" replace />} />
          {/* Nav reorg (2026-08): Dashboard, Agenda, Rules, and Awards folded
              into Calendar/Household/Store respectively - these keep old
              bookmarks, PWA shortcuts, notification links, and search-result
              links from 404ing instead of silently updating every reference. */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/agenda" element={<Navigate to="/?view=agenda" replace />} />
          <Route path="/rules" element={householdOn ? <Navigate to="/household#rules" replace /> : <Navigate to="/" replace />} />
          <Route path="/awards" element={storeRouteOn ? <Navigate to="/store?tab=awards" replace /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800">
      {children}
    </div>
  );
}
