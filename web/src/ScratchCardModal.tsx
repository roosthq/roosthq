import { useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Same fairness contract as WheelModal - a different reveal animation for
// the same underlying RewardGame (server rolls at spin time regardless).
export default function ScratchCardModal({
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
  const [scratching, setScratching] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function scratch() {
    if (scratching || revealed) return;
    setScratching(true);
    try {
      const r = await onSpin();
      setResult(r);
      // Let the scratch-wipe transition (see the covered <button> below)
      // finish before calling it done - same "motion before the outcome"
      // beat the wheel and the box both use.
      setTimeout(() => {
        setRevealed(true);
        setScratching(false);
        celebrate(undefined, 'rewardGameWin');
      }, 900);
    } catch {
      setScratching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎟️ Scratch card</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {revealed ? 'You won' : scratching ? 'Scratching…' : `Tap to scratch (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <div className="relative flex h-40 w-64 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg p-2 text-center">
        <div className="text-3xl font-extrabold text-slate-800">
          {result === null ? '?' : result.wonKind === 'PRIZE' ? `${result.prize?.icon ?? '🎁'} ${result.prize?.name}` : `+${result.amount}`}
        </div>
        {!revealed && (
          <button
            onClick={scratch}
            disabled={scratching}
            className={`absolute inset-0 flex items-center justify-center text-3xl transition-all duration-[900ms] ${
              scratching ? 'translate-x-full opacity-0' : ''
            }`}
            style={{ background: 'repeating-linear-gradient(135deg, #9ca3af, #9ca3af 10px, #6b7280 10px, #6b7280 20px)' }}
          >
            {!scratching && '🎟️'}
          </button>
        )}
      </div>
      {revealed && result && (
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
      )}
    </div>
  );
}
