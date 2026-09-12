import { Routes, Route, Navigate } from 'react-router-dom';
import { familyFeatureEnabled, pluralize, type Me, type FamilySettings } from './api';
import KidNav, { type KidTab } from './KidNav';
import KidHomePage from './pages/KidHomePage';
import ChoresPage from './pages/ChoresPage';
import StorePage from './pages/StorePage';
import ProfilePage from './pages/ProfilePage';
import MySettingsPage from './pages/MySettingsPage';
import type { FontSize } from './api';

// The whole app, swapped in by App.tsx whenever this kid has Kid View on
// (User.kidView - see MembersManager's own toggle). Same data/pages as the
// adult app underneath (ChoresPage/StorePage/ProfilePage are reused
// unmodified - the actual chores/store/games/learning logic isn't what kid
// feedback called "too complicated"), just a completely different shell
// around them: a handful of giant icon tabs instead of the full text menu,
// nothing admin-only ever in reach. Casey's own instruction, 2026-09-12.
export default function KidApp({
  me,
  family,
  tokenName,
  tokenIcon,
  tokenValueUsd,
  onChangeColorTheme,
  onChangeFontSize,
  onUpdateProfile,
  onLoggedOut,
}: {
  me: Me;
  family: FamilySettings | null;
  tokenName: string;
  tokenIcon: string;
  tokenValueUsd: number;
  onChangeColorTheme: (next: string) => void;
  onChangeFontSize: (next: FontSize) => void;
  onUpdateProfile: (patch: Partial<{ displayName: string; username: string | null; email: string | null; avatar: string | null }>) => Promise<void>;
  onLoggedOut: () => void;
}) {
  const choresOn = familyFeatureEnabled(family, 'chores');
  const storeOn = familyFeatureEnabled(family, 'store');
  const miniGamesOn = familyFeatureEnabled(family, 'miniGames');
  const learningGamesOn = familyFeatureEnabled(family, 'learningGames');
  const storeRouteOn = storeOn || miniGamesOn || learningGamesOn;
  const chorePlural = pluralize(family?.choreWord ?? 'Chore');

  const tabs: KidTab[] = [{ to: '/', icon: '🏠', label: 'Home' }];
  if (choresOn) tabs.push({ to: '/chores', icon: '🧹', label: chorePlural });
  if (storeOn) tabs.push({ to: '/store?tab=prizes', icon: '🎁', label: 'Store' });
  if (miniGamesOn) tabs.push({ to: '/store?tab=games', icon: '🎮', label: 'Play' });
  if (learningGamesOn) tabs.push({ to: '/store?tab=learning', icon: '📚', label: 'Learn' });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <KidNav me={me} tokenIcon={tokenIcon} tabs={tabs} />
      {/* pb-24: clears the fixed bottom tab bar (see KidNav) so the last
          bit of real content is never sitting underneath it. */}
      <main className="mx-auto max-w-2xl p-4 pb-24">
        <Routes>
          <Route path="/" element={<KidHomePage me={me} storeOn={storeOn} miniGamesOn={miniGamesOn} learningGamesOn={learningGamesOn} />} />
          <Route path="/chores" element={choresOn ? <ChoresPage me={me} /> : <Navigate to="/" replace />} />
          <Route
            path="/store"
            element={
              storeRouteOn ? (
                <StorePage me={me} tokenName={tokenName} tokenIcon={tokenIcon} tokenValueUsd={tokenValueUsd} hideTabSwitcher />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/profile"
            element={<ProfilePage me={me} tokenName={tokenName} tokenIcon={tokenIcon} chorePlural={chorePlural} />}
          />
          <Route
            path="/my-settings"
            element={
              <MySettingsPage
                me={me}
                onChangeColorTheme={onChangeColorTheme}
                onChangeFontSize={onChangeFontSize}
                onUpdateProfile={onUpdateProfile}
                onLoggedOut={onLoggedOut}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
