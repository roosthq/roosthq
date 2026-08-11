import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

const ROWS = 7;

// Same fairness contract as every other reveal - onSpin() alone decides the
// outcome; the ball's path down the pegboard is cosmetic. Unlike the first
// version of this component, the path is driven step-by-step (one rAF tween
// per peg row) so the ball's on-screen x position and the slot that lights
// up at the bottom are THE SAME NUMBER - it used to pick a random "landed"
// slot independently of where the ball visually stopped.
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
  // Fractional x (0..1) and y (0..1) of the ball, updated every frame.
  const [ballX, setBallX] = useState(0.5);
  const [ballY, setBallY] = useState(0);
  // The ref, not the state, is read between tween() calls - state updates
  // are batched/async, so reading `ballX` itself from the loop below would
  // see a stale value from whenever drop() was called, never advancing.
  const pos = useRef({ x: 0.5, y: 0 });
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Tween the ball from wherever `pos` currently is to (x1,y1) over `ms`.
  function tween(x1: number, y1: number, ms: number): Promise<void> {
    const x0 = pos.current.x;
    const y0 = pos.current.y;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease-in-out, gravity-ish
        pos.current = { x: x0 + (x1 - x0) * eased, y: y0 + (y1 - y0) * eased };
        setBallX(pos.current.x);
        setBallY(pos.current.y);
        if (p < 1) raf.current = requestAnimationFrame(step);
        else resolve();
      };
      raf.current = requestAnimationFrame(step);
    });
  }

  async function drop() {
    if (dropping || result) return;
    setDropping(true);
    setLandedSlot(null);
    pos.current = { x: 0.5, y: 0 };
    setBallX(0.5);
    setBallY(0);
    let r: SpinResult;
    const spinPromise = onSpin();
    // Walk down the pegboard one row at a time, nudging left/right at each
    // peg - this is what actually produces the zigzag, not a single CSS
    // animation with a precomputed endpoint.
    let x = 0.5;
    for (let row = 0; row < ROWS; row++) {
      const nudge = (Math.random() < 0.5 ? -1 : 1) * (0.5 / ROWS) * (0.6 + Math.random() * 0.6);
      x = Math.min(0.95, Math.max(0.05, x + nudge));
      await tween(x, (row + 1) / ROWS, 260);
    }
    try {
      r = await spinPromise;
    } catch {
      setDropping(false);
      return;
    }
    const finalSlot = Math.min(slotCount - 1, Math.max(0, Math.floor(x * slotCount)));
    setLandedSlot(finalSlot);
    setResult(r);
    setDropping(false);
    celebrate(undefined, 'rewardGameWin');
  }

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">⚪ Plinko drop</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {result ? 'You won' : dropping ? 'Dropping…' : `Drop the ball (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <div className="relative h-64 w-72 overflow-hidden rounded-xl bg-slate-800 shadow-lg">
        {Array.from({ length: ROWS }, (_, r) => (
          <div key={r} className="absolute flex w-full justify-around" style={{ top: `${8 + r * (78 / ROWS)}%` }}>
            {Array.from({ length: r % 2 === 0 ? 6 : 5 }, (_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            ))}
          </div>
        ))}
        <div
          className="absolute h-4 w-4 rounded-full bg-white shadow"
          style={{ left: `${ballX * 100}%`, top: `${8 + ballY * 78}%`, transform: 'translate(-50%, -50%)' }}
        />
        <div className="absolute bottom-0 flex w-full justify-around border-t border-slate-600">
          {Array.from({ length: slotCount }, (_, i) => (
            <span
              key={i}
              className={`flex h-7 flex-1 items-center justify-center text-[10px] ${landedSlot === i ? 'bg-amber-400 font-bold text-slate-900' : 'bg-slate-700 text-slate-400'}`}
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
