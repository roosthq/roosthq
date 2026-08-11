import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Same fairness contract as WheelModal - a different reveal animation for
// the same underlying RewardGame (server rolls at spin time regardless).
export default function SlotMachineModal({
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
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  const [displayValue, setDisplayValue] = useState<string | number>(min);
  const spinInterval = useRef<number | undefined>(undefined);

  async function pull() {
    if (spinning || done) return;
    setSpinning(true);
    // Cycle through random values while the real roll is in flight, then
    // land on it once it comes back - jumping straight to the answer
    // wouldn't feel like a reel.
    spinInterval.current = window.setInterval(() => {
      setDisplayValue(min + Math.floor(Math.random() * (max - min + 1)));
    }, 80);
    let r: SpinResult;
    try {
      r = await onSpin();
    } catch {
      window.clearInterval(spinInterval.current);
      setSpinning(false);
      return;
    }
    setTimeout(() => {
      window.clearInterval(spinInterval.current);
      setDisplayValue(r.wonKind === 'PRIZE' ? r.prize?.icon ?? '🎁' : (r.amount ?? 0));
      setResult(r);
      setSpinning(false);
      setDone(true);
      celebrate(undefined, 'rewardGameWin');
    }, 1400);
  }

  useEffect(() => () => window.clearInterval(spinInterval.current), []);

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎰 Slot machine</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">{done ? 'You won' : 'Pull the lever!'}</p>
      <div className="flex h-28 w-28 items-center justify-center rounded-xl border-4 border-yellow-400 bg-slate-900 text-6xl font-extrabold text-yellow-300 shadow-lg">
        {displayValue}
      </div>
      {done && result ? (
        <>
          {result.wonKind === 'PRIZE' ? (
            <div className="text-4xl font-extrabold text-white">{result.prize?.name}!</div>
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
          disabled={spinning}
          onClick={pull}
          className="rounded-lg bg-yellow-400 px-6 py-2.5 font-semibold text-slate-900 hover:bg-yellow-300 disabled:opacity-50"
        >
          {spinning ? 'Spinning…' : 'Pull lever'}
        </button>
      )}
    </div>
  );
}
