import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';

// Real port of the "Pin & Tumbler" prototype from the Task Deck artifact
// (PLANNING.md §18) - Lock Pick, reskinned as an actual pin-and-tumbler
// keyway. N pins in sequence, each with a narrower sweet-spot window and a
// faster rise than the last; tap the stage the instant a pin's window
// crosses the fixed shear line.
//
// Deliberately no sound yet - the prototype's synthesized SFX engine hasn't
// been ported into the real app's own sound system (celebrate.ts/
// soundAssignments) yet; flagging that gap rather than silently shipping
// without it.
export interface MiniGamePinTumblerConfig extends MiniGameConfig {
  steps?: number; // pin count, 3-7, default 5
  timeLimit?: number; // seconds, default 25
  misses?: number; // bad taps allowed, default 3
  difficulty?: number; // 0 Easy / 1 Normal / 2 Hard, default 1
}

export interface MiniGamePlayReport {
  won: boolean;
  stepsCompleted: number;
  totalSteps: number;
  timeTakenSeconds: number;
}

export default function MiniGamePinTumbler({
  config,
  onFinish,
}: {
  config: MiniGamePinTumblerConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx = ctx2d; // narrowed, non-null for every closure below

    const N = Math.max(1, Math.min(10, Math.floor(config.steps ?? 5)));
    const timeLimit = Math.max(5, config.timeLimit ?? 25);
    const missesAllowed = Math.max(0, config.misses ?? 3);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const WIN_MULT = [1.5, 1, 0.65][difficulty];
    const SPEED_MULT = [0.8, 1, 1.25][difficulty];

    let idx = 0;
    let missed = 0;
    let done = false;
    const startedAt = performance.now();

    function pinParams(i: number) {
      const t = N > 1 ? i / (N - 1) : 0;
      return { winH: (0.34 - t * 0.2) * WIN_MULT, speed: (0.55 + t * 1.1) * SPEED_MULT, shear: 0.42 };
    }
    function mk(i: number) {
      const p = pinParams(i);
      return { phase: Math.random() * Math.PI * 2, speed: p.speed, winH: p.winH, shear: p.shear };
    }
    let pin = mk(0);

    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({
        won,
        stepsCompleted: idx,
        totalSteps: N,
        timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000),
      });
    }

    const draw = () => {
      const w = canvas.width,
        h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#181c26';
      ctx.fillRect(w / 2 - 90, 20, 180, h - 40);
      ctx.strokeStyle = '#2a3040';
      ctx.lineWidth = 3;
      ctx.strokeRect(w / 2 - 90, 20, 180, h - 40);
      const shearY = 20 + (h - 40) * pin.shear;
      ctx.strokeStyle = '#e8a94a';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 90, shearY);
      ctx.lineTo(w / 2 + 90, shearY);
      ctx.stroke();
      ctx.setLineDash([]);
      const osc = (Math.sin(pin.phase) + 1) / 2;
      const travel = h - 60;
      const pinY = 30 + travel * (1 - osc);
      const winTop = shearY - (pin.winH * travel) / 2;
      const winBot = shearY + (pin.winH * travel) / 2;
      ctx.fillStyle = 'rgba(79, 224, 201, 0.15)';
      ctx.fillRect(w / 2 - 90, winTop, 180, winBot - winTop);
      ctx.strokeStyle = '#4fe0c9';
      ctx.lineWidth = 2;
      ctx.strokeRect(w / 2 - 90, winTop, 180, winBot - winTop);
      ctx.fillStyle = '#c7cad6';
      ctx.fillRect(w / 2 - 22, pinY, 44, h - pinY - 10);
      ctx.fillStyle = '#8f93a3';
      ctx.beginPath();
      ctx.moveTo(w / 2 - 22, pinY);
      ctx.lineTo(w / 2, pinY - 18);
      ctx.lineTo(w / 2 + 22, pinY);
      ctx.fill();
      ctx.fillStyle = '#5a5e6e';
      ctx.fillRect(w / 2 - 22, pinY, 44, 8);
      ctx.fillStyle = '#4b4f60';
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PIN ' + (idx + 1) + '/' + N, w / 2, h - 12);
      const missesLeft = Math.max(0, missesAllowed - missed);
      ctx.fillStyle = missesLeft <= 1 ? '#ef5468' : '#8b90a4';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('MISSES LEFT: ' + missesLeft, w - 16, 24);
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      ctx.fillStyle = remaining < 6 ? '#ef5468' : '#8b90a4';
      ctx.textAlign = 'left';
      ctx.fillText(Math.ceil(remaining) + 's', 16, 24);
    };

    function within() {
      const osc = (Math.sin(pin.phase) + 1) / 2;
      const target = 1 - pin.shear;
      return Math.abs(osc - target) < pin.winH / 2;
    }

    let raf = 0;
    let last: number | null = null;
    function tick(ts: number) {
      if (done) return;
      if (last == null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      pin.phase += pin.speed * dt;
      draw();
      if ((performance.now() - startedAt) / 1000 >= timeLimit) {
        finish(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function onPick() {
      if (done) return;
      if (within()) {
        idx++;
        if (idx >= N) {
          finish(true);
          return;
        }
        pin = mk(idx);
      } else {
        missed++;
        if (missed > missesAllowed) {
          finish(false);
          return;
        }
      }
    }

    canvas.addEventListener('pointerdown', onPick);
    draw();
    raf = requestAnimationFrame(tick);
    return () => {
      canvas.removeEventListener('pointerdown', onPick);
      cancelAnimationFrame(raf);
    };
    // config is captured once per mount by design - a new play session
    // always gets a fresh component instance (see MiniGamePlayer), so this
    // effect intentionally doesn't react to config changing mid-game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={420}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '0.75rem', touchAction: 'none' }}
    />
  );
}
