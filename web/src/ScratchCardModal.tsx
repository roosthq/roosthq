import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

// Internal canvas resolution - deliberately low-res (getImageData on every
// drag sample needs to stay cheap) and upscaled via CSS; a scratch coating
// texture reads fine a little soft, unlike crisp UI would.
const CANVAS_W = 140;
const CANVAS_H = 80;
const REVEAL_THRESHOLD = 0.5; // scratch off half of it and the rest auto-clears

// A REAL scratch-off, not a timed wipe animation: drag/finger-drag erases a
// stroke from the coating canvas (destination-out compositing), the actual
// result underneath is genuinely there the whole time - once you've cleared
// enough of it, the rest fades away on its own. Same fairness contract as
// every other reveal - onSpin() alone decides the outcome; scratching just
// exposes what's already been decided.
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
  const [revealed, setRevealed] = useState(false);
  const [pct, setPct] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const resultRef = useRef<SpinResult | null>(null);
  const spinStarted = useRef(false);
  const thresholdMet = useRef(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0, '#9ca3af');
    grad.addColorStop(1, '#6b7280');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCRATCH HERE', CANVAS_W / 2, CANVAS_H / 2 + 4);
  }, []);

  function completeReveal() {
    setRevealed(true);
    celebrate(undefined, 'rewardGameWin');
  }

  async function ensureSpin() {
    if (spinStarted.current) return;
    spinStarted.current = true;
    try {
      const r = await onSpin();
      resultRef.current = r;
      setResult(r);
      if (thresholdMet.current) completeReveal();
    } catch {
      spinStarted.current = false;
    }
  }

  function posOf(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * CANVAS_W, y: ((e.clientY - rect.top) / rect.height) * CANVAS_H };
  }

  function erase(x: number, y: number) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    ctx.beginPath();
    if (last.current) {
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    last.current = { x, y };
  }

  function checkPct() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    let cleared = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) cleared++;
    const p = cleared / (CANVAS_W * CANVAS_H);
    setPct(p);
    if (p >= REVEAL_THRESHOLD && !thresholdMet.current) {
      thresholdMet.current = true;
      if (resultRef.current) completeReveal();
      // else: waits for onSpin() to resolve, then ensureSpin() finishes the reveal.
    }
  }

  function onDown(e: React.PointerEvent) {
    if (revealed) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = null;
    void ensureSpin();
    const { x, y } = posOf(e);
    erase(x, y);
    checkPct();
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing.current || revealed) return;
    const { x, y } = posOf(e);
    erase(x, y);
    checkPct();
  }
  function onUp() {
    drawing.current = false;
    last.current = null;
  }

  const displayValue = result === null ? '···' : result.wonKind === 'PRIZE' ? `${result.prize?.icon ?? '🎁'} ${result.prize?.name}` : `+${result.amount}`;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎟️ Scratch card</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {revealed ? 'You won' : `Scratch it off (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <div className="relative flex h-40 w-64 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg" style={{ touchAction: 'none' }}>
        <div className="px-3 text-center text-2xl font-extrabold text-slate-800">{displayValue}</div>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 h-full w-full cursor-pointer transition-opacity duration-500"
          style={{ opacity: revealed ? 0 : 1, pointerEvents: revealed ? 'none' : 'auto' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      {!revealed && pct > 0 && <p className="text-xs text-slate-400">{Math.round(Math.min(100, (pct / REVEAL_THRESHOLD) * 100))}% scratched</p>}
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
