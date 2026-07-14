import { NavLink } from 'react-router-dom';
import type { Me } from './api';

export default function Nav({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-3 text-lg font-bold">Roost HQ</span>
        <NavLink to="/" end className={cls}>Calendar</NavLink>
        <NavLink to="/chores" className={cls}>Chores</NavLink>
        <NavLink to="/store" className={cls}>Store</NavLink>
        <NavLink to="/profile" className={cls}>My Profile</NavLink>
        {isAdult && <NavLink to="/settings" className={cls}>Settings</NavLink>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <a href="/?display=1" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800">
          Display ↗
        </a>
        <span className="text-slate-500">{me.displayName}</span>
        <button onClick={onLogout} className="text-slate-500 hover:text-slate-800">
          Sign out
        </button>
      </div>
    </nav>
  );
}
