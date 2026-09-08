import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';

// Real port of "Safe Cracker" (rotary combo dial) from the Task Deck
// prototype (PLANNING.md §18) - drag the dial until you hear the click,
// then tap SET; it stops exactly where you let go, no drift. `timeLimit`
// enforced here (the deck's shared runClock harness doesn't exist in the
// real app).
export interface MiniGameSafeCrackerConfig extends MiniGameConfig {
  steps?: number; // digits, 2-5, default 3
  timeLimit?: number; // seconds, default 35
  misses?: number; // bad sets allowed, 0-5, default 3
  difficulty?: number; // 0 Easy (shows hints) / 1 Normal / 2 Hard, default 1
}

// A shaded, beveled knob with grip ridges and a specular highlight, shared
// between the real mount and the idle preview - same as the deck's own
// drawSpindle/drawPointer.
function drawSpindle(ctx: CanvasRenderingContext2D, cx: number, cy: number, knobR: number) {
  const grad = ctx.createRadialGradient(cx - knobR * 0.35, cy - knobR * 0.4, knobR * 0.1, cx, cy, knobR);
  grad.addColorStop(0, '#4d525f');
  grad.addColorStop(0.55, '#2a2e38');
  grad.addColorStop(1, '#131519');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, knobR, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (knobR - 3);
    const y1 = cy + Math.sin(a) * (knobR - 3);
    const x2 = cx + Math.cos(a) * (knobR - 9);
    const y2 = cy + Math.sin(a) * (knobR - 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#5a5f70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, knobR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, knobR - 12, 0, Math.PI * 2);
  ctx.stroke();
  const spec = ctx.createRadialGradient(cx - knobR * 0.4, cy - knobR * 0.45, 0, cx - knobR * 0.4, cy - knobR * 0.45, knobR * 0.6);
  spec.addColorStop(0, 'rgba(255,255,255,0.22)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, knobR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = spec;
  ctx.fillRect(cx - knobR, cy - knobR, knobR * 2, knobR * 2);
  ctx.restore();
}
// Fixed index pointer, tip pointing DOWN in at the ring - the way a real
// combination dial's index mark actually reads.
function drawPointer(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#e8534b';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - 2);
  ctx.lineTo(cx - 10, cy - r - 22);
  ctx.lineTo(cx + 10, cy - r - 22);
  ctx.fill();
}

export default function MiniGameSafeCracker({
  config,
  onFinish,
}: {
  config: MiniGameSafeCrackerConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx = ctx2d;

    const N = Math.max(1, Math.min(8, Math.floor(config.steps ?? 3)));
    const timeLimit = Math.max(5, config.timeLimit ?? 35);
    const missesAllowed = Math.max(0, Math.floor(config.misses ?? 3));
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const showHints = difficulty === 0;
    const TOL_MULT = [1.4, 1, 0.75][difficulty];

    let idx = 0;
    let missed = 0;
    let angle = 0;
    let dragging = false;
    let lastX = 0;
    let rawAngle = 0;
    const STEP = (Math.PI * 2) / 40;
    function tolFor(i: number) {
      const t = N > 1 ? i / (N - 1) : 0;
      return Math.min((0.26 - t * 0.16) * TOL_MULT, STEP * 0.45);
    }
    const POINTER_ANGLE = -Math.PI / 2;
    let targetNum = Math.floor(Math.random() * 40);
    let tol = tolFor(0);
    let done = false;
    const startedAt = performance.now();

    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({ won, stepsCompleted: idx, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const setBtn = document.createElement('button');
    setBtn.textContent = 'SET';
    setBtn.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:0.6rem 1.6rem;border-radius:0.6rem;border:none;background:#f2c14e;color:#241705;font-weight:700;font-family:inherit;cursor:pointer;z-index:2;';
    container.appendChild(setBtn);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2 - 30;
      const r = 190;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#181c26';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a3040';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (showHints) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(POINTER_ANGLE);
        ctx.strokeStyle = '#4fe0c9';
        ctx.shadowColor = '#4fe0c9';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.arc(0, 0, r, -tol, tol);
        ctx.stroke();
        ctx.restore();
        ctx.shadowBlur = 0;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + angle;
        const x = cx + Math.cos(a) * (r - 30);
        const y = cy + Math.sin(a) * (r - 30);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + Math.PI / 2);
        if (showHints && i === targetNum) {
          ctx.font = '700 20px "JetBrains Mono", monospace';
          ctx.fillStyle = '#4fe0c9';
          ctx.shadowColor = '#4fe0c9';
          ctx.shadowBlur = 10;
          ctx.fillText(String(i), 0, 0);
        } else {
          ctx.font = '600 15px "JetBrains Mono", monospace';
          ctx.fillStyle = '#c7cad6';
          ctx.fillText(String(i), 0, 0);
        }
        ctx.restore();
      }
      drawSpindle(ctx, cx, cy, r - 55);
      ctx.fillStyle = '#f2c14e';
      ctx.font = '700 20px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${idx + 1}/${N}`, cx, cy);
      drawPointer(ctx, cx, cy, r);
      const missesLeft = Math.max(0, missesAllowed - missed);
      ctx.fillStyle = missesLeft <= 1 ? '#ef5468' : '#8b90a4';
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('BAD SETS LEFT: ' + missesLeft, w - 16, 24);
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      ctx.fillStyle = remaining < 6 ? '#ef5468' : '#8b90a4';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(Math.ceil(remaining) + 's', 16, 24);
    };
    function within() {
      const twoPi = Math.PI * 2;
      const numAngle = (targetNum / 40) * twoPi + angle;
      const a = ((numAngle % twoPi) + twoPi) % twoPi;
      const t = ((POINTER_ANGLE % twoPi) + twoPi) % twoPi;
      let diff = Math.abs(a - t);
      if (diff > Math.PI) diff = twoPi - diff;
      return diff < tol;
    }
    const SENS = 0.045;
    function onDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      e.preventDefault();
    }
    function onMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      rawAngle += dx * SENS;
      angle = Math.round(rawAngle / STEP) * STEP;
      lastX = e.clientX;
      draw();
      e.preventDefault();
    }
    function onUp() {
      dragging = false;
    }
    function onSet() {
      if (done) return;
      if (within()) {
        idx++;
        if (idx >= N) {
          finish(true);
          return;
        }
        targetNum = Math.floor(Math.random() * 40);
        tol = tolFor(idx);
      } else {
        missed++;
        if (missed > missesAllowed) {
          finish(false);
          return;
        }
      }
      draw();
    }
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    setBtn.addEventListener('click', onSet);
    draw();

    let raf = 0;
    function tick() {
      if (done) return;
      draw();
      if ((performance.now() - startedAt) / 1000 >= timeLimit) {
        finish(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setBtn.removeEventListener('click', onSet);
      container.removeChild(setBtn);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: 460, touchAction: 'none' }}>
      <canvas ref={canvasRef} width={600} height={500} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '0.75rem' }} />
    </div>
  );
}

// Idle preview - the dial spins slowly on its own, no input, no scoring.
// Ported verbatim from the deck's own preview().
export function MiniGameSafeCrackerPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx = ctx2d;

    let angle = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2 - 30;
      const r = 190;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#181c26';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a3040';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 15px "JetBrains Mono", monospace';
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + angle;
        const x = cx + Math.cos(a) * (r - 30);
        const y = cy + Math.sin(a) * (r - 30);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = '#c7cad6';
        ctx.fillText(String(i), 0, 0);
        ctx.restore();
      }
      drawSpindle(ctx, cx, cy, r - 55);
      drawPointer(ctx, cx, cy, r);
    };
    let raf = 0;
    let last: number | null = null;
    function tick(ts: number) {
      if (last == null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      angle += 0.5 * dt;
      draw();
      raf = requestAnimationFrame(tick);
    }
    draw();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={500}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '0.75rem' }}
    />
  );
}
