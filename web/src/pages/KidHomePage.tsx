import { Link } from 'react-router-dom';
import type { Me } from '../api';
import ChoresPanel from '../ChoresPanel';

// Kid View's landing page - replaces Calendar as the kid's "/" (Casey's own
// instruction: kids don't need the dense grid an adult plans around, they
// need "what do I do right now"). Deliberately light: today's chores (the
// one thing worth surfacing without being asked) plus a few big shortcuts -
// not a second dashboard competing with the bottom nav for the same jobs.
export default function KidHomePage({
  me,
  storeOn,
  miniGamesOn,
  learningGamesOn,
}: {
  me: Me;
  storeOn: boolean;
  miniGamesOn: boolean;
  learningGamesOn: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* ChoresPanel's own "today" variant already renders a "Today"
          heading - no need for a second one here. */}
      <ChoresPanel me={me} variant="today" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {storeOn && <ShortcutCard to="/store?tab=prizes" icon="🎁" label="Store" hint="Spend your tokens" />}
        {miniGamesOn && <ShortcutCard to="/store?tab=games" icon="🎮" label="Play" hint="Games you can buy" />}
        {learningGamesOn && <ShortcutCard to="/store?tab=learning" icon="📚" label="Learn" hint="Quiz + recess break" />}
      </div>
    </div>
  );
}

function ShortcutCard({ to, icon, label, hint }: { to: string; icon: string; label: string; hint: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-6 text-center shadow-sm active:scale-95"
    >
      <span className="text-5xl">{icon}</span>
      <span className="text-lg font-bold text-slate-700">{label}</span>
      <span className="text-xs text-slate-400">{hint}</span>
    </Link>
  );
}
