import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, loginUrl, type Me, type FamilySettings } from './api';
import Nav from './Nav';
import CalendarPage from './pages/CalendarPage';
import ChoresPage from './pages/ChoresPage';
import StorePage from './pages/StorePage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [family, setFamily] = useState<FamilySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(async (u) => {
        setMe(u);
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
    setMe(null);
  }

  if (loading) return <Centered>Loading…</Centered>;

  if (!me) {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const needInvite = params.get('auth') === 'need_invite';
    const href = invite ? `${loginUrl}?invite=${encodeURIComponent(invite)}` : loginUrl;
    return (
      <Centered>
        <h1 className="text-4xl font-bold">Roost HQ</h1>
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
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <Nav me={me} onLogout={logout} />
      <main className="mx-auto max-w-5xl p-6">
        <Routes>
          <Route path="/" element={<CalendarPage me={me} />} />
          <Route path="/chores" element={<ChoresPage me={me} />} />
          <Route path="/store" element={<StorePage me={me} tokenName={tokenName} />} />
          <Route path="/profile" element={<ProfilePage me={me} tokenName={tokenName} />} />
          <Route path="/profile/:id" element={<ProfilePage me={me} tokenName={tokenName} />} />
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
