import { useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

const ROWS = 6;
const PEG_ROWS = Array.from({ length: ROWS }, (_, r) => r);

// Same fairness contract as every other reveal - the ball's zigzag path down
// the pegboard is a random cosmetic walk, not a physics sim; the slot it
// lands in doesn't decide anything, onSpin() already did.
export default function PlinkoModal({
  min,
  max,
  slotCount = 7,
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
  const [result, setResult] = useState<SpinResult | null>(null);
  const [dropping, setDropping] = useState(false);
  const [landedSlot, setLandedSlot] = useState<number | null>(null);
  // A random left/right nudge per peg row - purely cosmetic, drawn once per
  // drop so the ball's path is different every time.
  const [path, setPath] = useState<number[]>(() => PEG_ROWS.map(() => (Math.random() < 0.5 ? -1 : 1)));

  async function drop() {
    if (dropping || result) return;
    setDropping(true);
    setPath(PEG_ROWS.map(() => (Math.random() < 0.5 ? -1 : 1)));
    let r: SpinResult;
    try {
      r = await onSpin();
    } catch {
      setDropping(false);
      return;
    }
    setLandedSlot(Math.floor(Math.random() * slotCount));
    setTimeout(() => {
      setResult(r);
      setDropping(false);
      celebrate(undefined, 'rewardGameWin');
    }, 1300);
  }

  // Net horizontal drift across all rows, as a percentage offset for the ball.
  const drift = path.reduce((s, d) => s + d, 0) * 6;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <style>{`
        @keyframes plinko-fall { 0% { top: 0%; } 100% { top: 92%; } }
      `}</style>
      <h2 className="text-2xl font-bold text-white">⚪ Plinko drop</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {result ? 'You won' : dropping ? 'Dropping…' : `Drop the ball (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <div className="relative h-56 w-64 overflow-hidden rounded-xl bg-slate-800 shadow-lg">
        {PEG_ROWS.map((r) => (
          <div key={r} className="absolute flex w-full justify-around" style={{ top: `${8 + r * 13}%` }}>
            {Array.from({ length: r % 2 === 0 ? 5 : 4 }, (_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            ))}
          </div>
        ))}
        <div
          className="absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow"
          style={
            dropping
              ? { animation: 'plinko-fall 1.2s ease-in forwards', left: `calc(50% + ${drift}%)` }
              : { top: landedSlot !== null ? '92%' : '0%', left: `calc(50% + ${drift}%)` }
          }
        />
        <div className="absolute bottom-0 flex w-full justify-around border-t border-slate-600">
          {Array.from({ length: slotCount }, (_, i) => (
            <span
              key={i}
              className={`flex h-6 w-6 items-center justify-center rounded-b text-[10px] ${landedSlot === i && !dropping ? 'bg-amber-400 text-slate-900 font-bold' : 'bg-slate-700 text-slate-400'}`}
            >
              {i + 1}
            </span>
          ))}
        </div>
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
          disabled={dropping}
          onClick={drop}
          className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        >
          {dropping ? 'Dropping…' : 'Drop ball'}
        </button>
      )}
    </div>
  );
}
