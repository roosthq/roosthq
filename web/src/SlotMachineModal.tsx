import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

const SYMBOLS = ['🍒', '🍋', '⭐', '7️⃣', '💎', '🔔'];
const REEL_COUNT = 3;
// How far down (px) the lever has to travel before letting go actually
// pulls it - short of that, it just springs back with no spin.
const PULL_THRESHOLD = 70;
const RAIL_LENGTH = 100;

// A real cabinet look (frame, payout window, 3 reels) with an actual lever
// to grab and pull down - not just a button. The reels are cosmetic (three
// independent symbol cycles, staggered stops); the payout window below them
// is what actually reports onSpin()'s real result, same fairness contract
// every other reveal uses.
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
  const [reels, setReels] = useState<string[]>(['🍒', '🍋', '⭐']);
  const [leverY, setLeverY] = useState(0); // 0..1, how far down the handle is
  const [leverDragging, setLeverDragging] = useState(false);
  const intervals = useRef<number[]>([]);
  const dragStartY = useRef(0);

  async function pull() {
    if (spinning || done) return;
    setSpinning(true);
    // Each reel spins independently and stops in sequence - a classic slot
    // "clunk, clunk, clunk" instead of all three freezing at once.
    intervals.current = [0, 1, 2].map((i) =>
      window.setInterval(() => {
        setReels((r) => r.map((v, idx) => (idx === i ? SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] : v)));
      }, 70),
    );
    let r: SpinResult;
    const spinPromise = onSpin();
    // Stop reels 0, 1, 2 at staggered times regardless of when the server
    // actually answers - purely cosmetic pacing.
    for (let i = 0; i < REEL_COUNT; i++) {
      await new Promise((res) => setTimeout(res, 500));
      window.clearInterval(intervals.current[i]);
      setReels((prev) => prev.map((v, idx) => (idx === i ? SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] : v)));
    }
    try {
      r = await spinPromise;
    } catch {
      setSpinning(false);
      return;
    }
    setResult(r);
    setSpinning(false);
    setDone(true);
    celebrate(undefined, 'rewardGameWin');
  }

  useEffect(() => () => intervals.current.forEach((id) => window.clearInterval(id)), []);

  function onLeverDown(e: React.PointerEvent) {
    if (spinning || done) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    setLeverDragging(true);
  }
  function onLeverMove(e: React.PointerEvent) {
    if (!leverDragging) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setLeverY(Math.min(1, dy / RAIL_LENGTH));
  }
  function onLeverUp() {
    if (!leverDragging) return;
    setLeverDragging(false);
    const pulled = leverY * RAIL_LENGTH >= PULL_THRESHOLD;
    setLeverY(0);
    if (pulled) void pull();
  }

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎰 Slot machine</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {done ? 'You won' : `Pull the lever down and let go! (${min}-${max} ${tokenName}, or a real prize)`}
      </p>

      <div className="flex items-end gap-1">
        {/* Cabinet */}
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #7a1f2b, #4a1018)', border: '4px solid #d4af37' }}>
          <div className="flex gap-2 rounded-lg bg-slate-900 p-2" style={{ border: '3px solid #d4af37' }}>
            {reels.map((sym, i) => (
              <div key={i} className="rgm-surface flex h-16 w-14 items-center justify-center rounded text-4xl shadow-inner">
                {sym}
              </div>
            ))}
          </div>
          <div className="mt-3 flex h-12 items-center justify-center rounded-lg bg-slate-900 text-xl font-extrabold text-yellow-300" style={{ border: '2px solid #d4af37' }}>
            {result === null ? '?' : result.wonKind === 'PRIZE' ? result.prize?.icon ?? '🎁' : `+${result.amount}`}
          </div>
        </div>
        {/* Lever: a rail + handle, drag down and release */}
        <div className="relative flex h-40 w-8 flex-col items-center" style={{ touchAction: 'none' }}>
          <div className="h-full w-1.5 rounded-full bg-slate-500" />
          <button
            onPointerDown={onLeverDown}
            onPointerMove={onLeverMove}
            onPointerUp={onLeverUp}
            onPointerCancel={onLeverUp}
            disabled={spinning || done}
            aria-label="Pull lever"
            className="absolute left-1/2 h-8 w-8 -translate-x-1/2 rounded-full shadow-lg disabled:opacity-50"
            style={{
              top: `${leverY * RAIL_LENGTH}px`,
              background: 'radial-gradient(circle at 30% 30%, #ff6b6b, #b91c1c)',
              transition: leverDragging ? 'none' : 'top 220ms ease-out',
            }}
          />
        </div>
      </div>

      {done ? (
        <>
          {result?.wonKind === 'PRIZE' ? (
            <div className="text-4xl font-extrabold text-white">{result.prize?.name}!</div>
          ) : (
            <div className="text-5xl font-extrabold text-white">
              +{result?.amount} {tokenName}!
            </div>
          )}
          {source && <div className="text-sm text-slate-300">for {source}</div>}
          <button onClick={onClose} className="rgm-btn rounded-lg px-6 py-2.5 font-semibold">
            Collect
          </button>
        </>
      ) : (
        <button
          disabled={spinning}
          onClick={() => void pull()}
          className="rounded-lg bg-yellow-400 px-6 py-2.5 font-semibold text-slate-900 hover:bg-yellow-300 disabled:opacity-50"
        >
          {spinning ? 'Spinning…' : 'Pull lever'}
        </button>
      )}
    </div>
  );
}
