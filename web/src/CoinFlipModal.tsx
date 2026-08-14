import { useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Same fairness contract as every other reveal - heads/tails is pure flavor
// ("double or nothing" framing from the plan), the actual amount/prize is
// decided by onSpin() regardless of which face the coin lands on.
export default function CoinFlipModal({
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
  const [flipping, setFlipping] = useState(false);
  const [face, setFace] = useState<'heads' | 'tails'>('heads');

  async function flip() {
    if (flipping || result) return;
    setFlipping(true);
    let r: SpinResult;
    try {
      r = await onSpin();
    } catch {
      setFlipping(false);
      return;
    }
    setFace(Math.random() < 0.5 ? 'heads' : 'tails');
    setTimeout(() => {
      setResult(r);
      setFlipping(false);
      celebrate(undefined, 'rewardGameWin');
    }, 900);
  }

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <style>{`
        @keyframes coin-flip { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(1440deg); } }
      `}</style>
      <h2 className="text-2xl font-bold text-white">🪙 Coin flip</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {result ? 'You won' : flipping ? 'Flipping…' : `Flip for ${min}-${max} ${tokenName} (or a real prize)`}
      </p>
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-yellow-400 bg-yellow-300 text-4xl font-extrabold text-yellow-900 shadow-lg"
        style={flipping ? { animation: 'coin-flip 0.9s ease-out' } : undefined}
      >
        {flipping ? '🪙' : face === 'heads' ? 'H' : 'T'}
      </div>
      {result ? (
        <>
          {result.wonKind === 'PRIZE' ? (
            <div className="flex flex-col items-center gap-1 text-4xl font-extrabold text-white">
              <span className="text-5xl">{result.prize?.icon ?? '🎁'}</span>
              <span>{result.prize?.name}!</span>
            </div>
          ) : result.wonKind === 'STREAK_FREEZE' ? (
            <div className="text-5xl font-extrabold text-white">🧊 +{result.amount} streak freeze{result.amount === 1 ? '' : 's'}!</div>
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
        <button
          disabled={flipping}
          onClick={flip}
          className="rounded-lg bg-yellow-400 px-6 py-2.5 font-semibold text-slate-900 hover:bg-yellow-300 disabled:opacity-50"
        >
          {flipping ? 'Flipping…' : 'Flip'}
        </button>
      )}
    </div>
  );
}
