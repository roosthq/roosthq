import { useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Deliberately a different mechanic from MysteryBoxModal, not a recolor of
// it: one wrapped present, four paper flaps peel open in sequence instead of
// picking one of several identical boxes. Same fairness contract as every
// other reveal - onSpin() alone decides the outcome.
export default function GiftBoxModal({
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
  const [unwrapping, setUnwrapping] = useState(false);
  const [peeled, setPeeled] = useState(false);

  async function unwrap() {
    if (unwrapping || result) return;
    setUnwrapping(true);
    let r: SpinResult;
    try {
      r = await onSpin();
    } catch {
      setUnwrapping(false);
      return;
    }
    // Flaps peel open first, then the number/prize lands - same "motion
    // before the outcome" beat every other reveal uses.
    setPeeled(true);
    setTimeout(() => {
      setResult(r);
      setUnwrapping(false);
      celebrate(undefined, 'rewardGameWin');
    }, 1000);
  }

  const flap = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
    const base: Record<string, string> = {
      tl: 'top-0 left-0 origin-top-left',
      tr: 'top-0 right-0 origin-top-right',
      bl: 'bottom-0 left-0 origin-bottom-left',
      br: 'bottom-0 right-0 origin-bottom-right',
    };
    const peeledTransform: Record<string, string> = {
      tl: 'rotate(-100deg) translate(-10%, -10%)',
      tr: 'rotate(100deg) translate(10%, -10%)',
      bl: 'rotate(100deg) translate(-10%, 10%)',
      br: 'rotate(-100deg) translate(10%, 10%)',
    };
    return (
      <div
        className={`absolute h-1/2 w-1/2 ${base[corner]} transition-all duration-700 ease-in`}
        style={{
          background: 'linear-gradient(135deg, #e07c5c, #b58ae0)',
          border: '2px solid rgba(255,255,255,0.6)',
          transform: peeled ? peeledTransform[corner] : 'none',
          opacity: peeled ? 0 : 1,
        }}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎁 Gift box unwrap</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {result ? 'You won' : unwrapping ? 'Unwrapping…' : `Tap to unwrap (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <button onClick={unwrap} disabled={unwrapping || !!result} className="rgm-surface relative h-40 w-40 rounded-lg shadow-lg disabled:cursor-default">
        <span className="absolute inset-0 flex items-center justify-center text-4xl font-extrabold" style={{ color: '#1e293b' }}>
          {result === null ? '?' : result.wonKind === 'PRIZE' ? result.prize?.icon ?? '🎁' : `+${result.amount}`}
        </span>
        {flap('tl')}
        {flap('tr')}
        {flap('bl')}
        {flap('br')}
        {/* Ribbon, sits above the flaps until they peel away */}
        {!peeled && (
          <>
            <div className="absolute left-1/2 top-0 h-full w-3 -translate-x-1/2" style={{ background: '#f0e6c8' }} />
            <div className="absolute left-0 top-1/2 h-3 w-full -translate-y-1/2" style={{ background: '#f0e6c8' }} />
          </>
        )}
      </button>
      {result && (
        <>
          {result.wonKind === 'PRIZE' ? (
            <div className="text-4xl font-extrabold text-white">{result.prize?.name}!</div>
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
