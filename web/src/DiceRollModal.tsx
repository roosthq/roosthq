import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Pip layout per face, as (row, col) on a 3x3 grid.
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

// A real die face - white rounded square, solid black pips - not a unicode
// glyph (too small/thin to read at a glance, especially on a kiosk touch
// screen from arm's length).
function Die({ value, size = 84 }: { value: number; size?: number }) {
  return (
    // Hardcoded #fff/#111, not the bg-white/bg-slate-900 Tailwind classes -
    // this app's global CSS bridge remaps those to theme-derived colors (see
    // index.css), which in dark mode turns a "white die, black pips" face
    // into something dark-on-dark and unreadable. A die face is white on
    // black always, same reasoning as Switch.tsx's knob.
    <div
      className="relative rounded-2xl shadow-lg"
      style={{ width: size, height: size, background: '#fff', border: '3px solid #1c2e1c' }}
    >
      {PIP_LAYOUT[value]?.map(([r, c], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: size * 0.16,
            height: size * 0.16,
            left: `${(c + 0.5) * (100 / 3)}%`,
            top: `${(r + 0.5) * (100 / 3)}%`,
            transform: 'translate(-50%, -50%)',
            background: '#111',
          }}
        />
      ))}
    </div>
  );
}

// Same fairness contract as every other reveal - the outcome is decided by
// onSpin() server-side; the dice pips are cosmetic. There's no real "total ->
// tier" math here since the reward range isn't bounded to 2-12 - the two
// faces are just derived from the resolved amount so they look plausible
// once everything lands together, not actually load-bearing.
export default function DiceRollModal({
  min,
  max,
  source,
  tokenName = 'tokens',
  onSpin,
  onClose,
}: {
  min: number;
  max: number;
  source?: string;
  tokenName?: string;
  onSpin: () => Promise<SpinResult>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<SpinResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  const rollInterval = useRef<number | undefined>(undefined);

  async function shake() {
    if (rolling || result) return;
    setRolling(true);
    rollInterval.current = window.setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 90);
    let r: SpinResult;
    try {
      r = await onSpin();
    } catch {
      window.clearInterval(rollInterval.current);
      setRolling(false);
      return;
    }
    setTimeout(() => {
      window.clearInterval(rollInterval.current);
      const n = r.wonKind === 'TOKENS' ? Math.max(1, r.amount ?? 1) : 7;
      setFaces([1 + ((n - 1) % 6), 1 + (Math.floor((n - 1) / 6) % 6)]);
      setResult(r);
      setRolling(false);
      celebrate(undefined, 'rewardGameWin');
    }, 1100);
  }

  useEffect(() => () => window.clearInterval(rollInterval.current), []);

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎲 Dice roll</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {result ? 'You won' : rolling ? 'Rolling…' : `Shake to roll (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <div className={`flex gap-5 ${rolling ? 'animate-bounce' : ''}`}>
        <Die value={faces[0]} />
        <Die value={faces[1]} />
      </div>
      {result ? (
        <>
          {result.wonKind === 'PRIZE' ? (
            <div className="flex flex-col items-center gap-1 text-4xl font-extrabold text-white">
              <span className="text-5xl">{result.prize?.icon ?? '🎁'}</span>
              <span>{result.prize?.name}!</span>
            </div>
          ) : (
            <div className="text-5xl font-extrabold text-white">
              +{result.amount} {tokenName}!
            </div>
          )}
          {source && <div className="text-sm text-slate-300">for {source}</div>}
          <button onClick={onClose} className="rgm-btn rounded-lg px-6 py-2.5 font-semibold">
            Collect
          </button>
        </>
      ) : (
        <button disabled={rolling} onClick={shake} className="rgm-btn rounded-lg px-6 py-2.5 font-semibold disabled:opacity-50">
          {rolling ? 'Rolling…' : 'Shake & drop'}
        </button>
      )}
    </div>
  );
}
