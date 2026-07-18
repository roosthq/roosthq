import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, loginUrl, pluralize, type Me, type FamilySettings, type FontSize } from './api';
import Nav from './Nav';
import Logo from './Logo';
import CalendarPage from './pages/CalendarPage';
import ChoresPage from './pages/ChoresPage';
import StorePage from './pages/StorePage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';
import RulesPage from './pages/RulesPage';
import AwardsPage from './pages/AwardsPage';

// data-mode = light/dark; data-theme = which of the 9 color themes (see
// COLOR_THEMES in api.ts). Two independent attributes — see index.css.
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(async (u) => {
        setMe(u);
        applyMode(u.themePref ?? 'light');
        applyColorTheme(u.colorTheme ?? 'meadow');
        applyFontSize(u.fontSizePref ?? 'md');
        try {
          setFamily(await api.familySettings());
        } catch {
          /* ignore */
        }
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
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
        <a href={href} className="mt-4 rounded-lg bg-slate-800 px-5 py-2.5 font-medium text-white hover:bg-slate-700">
          {invite ? 'Sign in with Google to join' : 'Sign in with Google'}
        </a>
      </Centered>
    );
  }

  const tokenName = family?.tokenName ?? 'Tokens';
  const tokenIcon = family?.tokenIcon ?? '🪙';
  const tokenValueUsd = family?.tokenValueUsd ?? 1;
  const choreWord = family?.choreWord ?? 'Chore';
  const chorePlural = pluralize(choreWord);
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Nav me={me} onLogout={logout} onToggleTheme={toggleTheme} onChangeFontSize={changeFontSize} />
      <main className="mx-auto max-w-5xl p-6">
        <Routes>
          <Route path="/" element={<CalendarPage me={me} />} />
          <Route path="/chores" element={<ChoresPage me={me} />} />
          <Route
            path="/store"
            element={<StorePage me={me} tokenName={tokenName} tokenIcon={tokenIcon} tokenValueUsd={tokenValueUsd} />}
          />
          <Route
            path="/profile"
            element={
              <ProfilePage
                me={me}
                tokenName={tokenName}
                tokenIcon={tokenIcon}
                chorePlural={chorePlural}
                onChangeColorTheme={changeColorTheme}
              />
            }
          />
          <Route
            path="/profile/:id"
            element={
              <ProfilePage
                me={me}
                tokenName={tokenName}
                tokenIcon={tokenIcon}
                chorePlural={chorePlural}
                onChangeColorTheme={changeColorTheme}
              />
            }
          />
          <Route path="/notifications" element={<NotificationsPage me={me} />} />
          <Route path="/rules" element={<RulesPage me={me} />} />
          <Route path="/awards" element={isAdult ? <AwardsPage /> : <Navigate to="/" replace />} />
          <Route path="/settings" element={isAdult ? <SettingsPage me={me} /> : <Navigate to="/" replace />} />
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
