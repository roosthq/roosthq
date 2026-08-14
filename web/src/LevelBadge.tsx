import { levelFor } from './api';
import LucideIcon from './LucideIcon';

// Level thresholds: level L spans earned = 5(L-1)² .. 5L². Returns everything
// a progress UI needs.
export function levelProgress(earned: number) {
  const level = levelFor(earned);
  const floor = 5 * (level - 1) * (level - 1);
  const ceil = 5 * level * level;
  return { level, into: earned - floor, needed: ceil - floor, next: ceil };
}

// ⭐ Lv N with an XP bar toward the next level. size 'sm' = inline chip
// (family strip, kiosk picker); 'lg' = profile stat block.
export default function LevelBadge({ earned, size = 'sm' }: { earned: number; size?: 'sm' | 'lg' }) {
  const { level, into, needed, next } = levelProgress(earned);
  const pct = Math.min(100, Math.round((into / needed) * 100));
  if (size === 'lg') {
    return (
      <div className="panel text-center">
        <div className="flex items-center justify-center gap-1 text-2xl font-bold" style={{ color: 'var(--accent)' }}>
          <LucideIcon name="star" size={24} /> {level}
        </div>
        <div className="text-xs text-slate-500">Level</div>
        <div className="mx-auto mt-2 h-2 w-full max-w-[9rem] overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          {earned} XP · {next - earned} to Lv {level + 1}
        </div>
      </div>
    );
  }
  return (
    <span className="inline-block text-center" title={`${earned} XP - ${next - earned} more to level ${level + 1}`}>
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">
        <LucideIcon name="star" size={12} /> Lv {level}
      </span>
      <span className="mx-auto mt-0.5 block h-1 w-12 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </span>
    </span>
  );
}
