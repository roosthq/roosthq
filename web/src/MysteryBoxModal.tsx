import { useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Same fairness contract as WheelModal - onSpin() is the only thing that
// decides the outcome (server-side, at the moment of picking), this is just
// a different reveal animation for the same underlying RewardGame.
export default function MysteryBoxModal({
  min,
  max,
  slotCount = 6,
  source,
  tokenName = 'tokens',
  onSpin,
  onClose,
}: {
  min: number;
  max: number;
  slotCount?: number;
  source?: string;
  tokenName?: string;
  onSpin: () => Promise<SpinResult>;
  onClose: () => void;
}) {
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [opening, setOpening] = useState(false);

  async function openBox(i: number) {
    if (opening || openedIndex !== null) return;
    setOpening(true);
    setOpenedIndex(i);
    try {
      const r = await onSpin();
      // A box that reveals the instant it's clicked doesn't feel like a box -
      // give the "opening" bounce a beat to play before the outcome lands.
      setTimeout(() => {
        setResult(r);
        setOpening(false);
        celebrate(undefined, 'rewardGameWin');
      }, 700);
    } catch {
      setOpening(false);
      setOpenedIndex(null);
    }
  }

  const done = result !== null;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">📦 Mystery box</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      {!done ? (
        <>
          <p className="max-w-xs text-center text-sm text-slate-300">
            Pick a box! Somewhere between {min} and {max} {tokenName} (or a real prize).
          </p>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: slotCount }, (_, i) => (
              <button
                key={i}
                onClick={() => openBox(i)}
                disabled={opening}
                className={`flex h-20 w-20 items-center justify-center rounded-xl text-4xl shadow-lg transition-transform sm:h-24 sm:w-24 ${
                  openedIndex === i ? 'scale-110 animate-bounce' : 'hover:scale-105'
                } ${openedIndex !== null && openedIndex !== i ? 'opacity-30' : ''}`}
                style={{ background: 'linear-gradient(135deg, #d4c06a, #b58ae0)' }}
              >
                📦
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">You won</p>
          {result.wonKind === 'PRIZE' ? (
            <div className="flex flex-col items-center gap-1 text-5xl font-extrabold text-white">
              <span>{result.prize?.icon ?? '🎁'}</span>
              <span className="text-3xl">{result.prize?.name}!</span>
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
      )}
    </div>
  );
}
