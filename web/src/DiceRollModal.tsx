import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

const PIPS: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };

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
      <div className={`flex gap-4 text-7xl ${rolling ? 'animate-bounce' : ''}`}>
        <span>{PIPS[faces[0]]}</span>
        <span>{PIPS[faces[1]]}</span>
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
          <button onClick={onClose} className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200">
            Collect
          </button>
        </>
      ) : (
        <button
          disabled={rolling}
          onClick={shake}
          className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        >
          {rolling ? 'Rolling…' : 'Shake & drop'}
        </button>
      )}
    </div>
  );
}
