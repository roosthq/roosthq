import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';
import { gameSfx } from './gameSfx';

// Real port of "Reactor Calibration" from the Task Deck prototype
// (PLANNING.md §18) - tap-and-hold the left/right half of the stage to
// steer the needle into the drifting safe zone and hold it there; drift
// outside too long and the heat bar climbs to an instant loss. Continuous,
// not step-based (no "steps" slider) - `totalSteps` is just 1.
//
// Two fixes carried over from the prototype's own already-fixed bugs
// (documented there): the hold/heat bars reset lineWidth before their own
// strokeRect so a leftover 22px border doesn't paint over the fill, and the
// zone drift is a bounded position anchored to THIS round's own start time,
// not an unbounded integral of absolute page-load time. One NEW fix here:
// the prototype's own mount() cleanup never cancelled its rAF loop on
// unmount (a real leak, not a deliberate choice) - added here.
export interface MiniGameReactorCalibrationConfig extends MiniGameConfig {
  timeLimit?: number; // seconds, default 25
  holdGoal?: number; // seconds to hold, 1-4 step 0.5, default 2
  difficulty?: number; // 0 Easy / 1 Normal / 2 Hard, default 1
}

export default function MiniGameReactorCalibration({
  config,
  onFinish,
}: {
  config: MiniGameReactorCalibrationConfig;
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
    const ctx = ctx2d;

    const timeLimit = Math.max(5, config.timeLimit ?? 25);
    const holdGoal = Math.max(0.5, config.holdGoal ?? 2);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const ZONE_W = [0.24, 0.16, 0.1][difficulty];
    const HEAT_RATE = [0.15, 0.22, 0.32][difficulty];
    const GRACE = [0.8, 0.5, 0.3][difficulty];

    let needle = 0;
    let vel = 0;
    let zoneCenter = 0.3;
    let held = 0;
    let pressing = 0;
    let heat = 0;
    let warned = false;
    let outTime = 0;
    let done = false;
    const startedAt = performance.now();

    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({ won, stepsCompleted: won ? 1 : 0, totalSteps: 1, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pressing = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
    };
    function onUp() {
      pressing = 0;
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    function heatColor(pct: number) {
      if (pct < 0.5) return '#4fe0c9';
      if (pct < 0.8) return '#f2c14e';
      return '#e8534b';
    }
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, w, h);
      const trackX0 = 50;
      const trackX1 = w - 50;
      ctx.strokeStyle = '#2a3040';
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(trackX0, cy);
      ctx.lineTo(trackX1, cy);
      ctx.stroke();
      const zoneW = ZONE_W * (trackX1 - trackX0);
      const zx = trackX0 + zoneCenter * (trackX1 - trackX0);
      ctx.strokeStyle = held / holdGoal > 0.99 ? '#4fe0c9' : '#f2c14e';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(zx - zoneW / 2, cy);
      ctx.lineTo(zx + zoneW / 2, cy);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const nx = trackX0 + needle * (trackX1 - trackX0);
      ctx.fillStyle = '#f1efe6';
      ctx.beginPath();
      ctx.arc(nx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      const pct = Math.min(1, held / holdGoal);
      ctx.fillStyle = '#4fe0c9';
      ctx.fillRect(trackX0, cy + 50, (trackX1 - trackX0) * pct, 10);
      ctx.strokeStyle = '#3a4054';
      ctx.strokeRect(trackX0, cy + 50, trackX1 - trackX0, 10);
      ctx.fillStyle = '#8b90a4';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('HOLD', trackX0, cy + 38);
      const hcol = heatColor(heat);
      ctx.fillStyle = '#1a1e28';
      ctx.fillRect(trackX0, cy + 76, trackX1 - trackX0, 14);
      ctx.fillStyle = hcol;
      ctx.shadowColor = hcol;
      ctx.shadowBlur = heat > 0.5 ? 12 : 0;
      ctx.fillRect(trackX0, cy + 76, (trackX1 - trackX0) * heat, 14);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#3a4054';
      ctx.strokeRect(trackX0, cy + 76, trackX1 - trackX0, 14);
      ctx.fillStyle = heat > 0.8 ? '#e8534b' : '#8b90a4';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText(heat > 0.8 ? 'CORE HEAT - CRITICAL' : 'CORE HEAT', trackX0, cy + 64);
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#4fe0c9';
      ctx.fillText('GOOD', trackX0, cy + 104);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2c14e';
      ctx.fillText('WARNING', trackX0 + (trackX1 - trackX0) * 0.65, cy + 104);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e8534b';
      ctx.fillText('CRITICAL', trackX1, cy + 104);
      ctx.textAlign = 'left';
      ctx.fillText('◀ hold left / right ▶ to steer', trackX0, cy - 40);
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      ctx.fillStyle = remaining < 6 ? '#ef5468' : '#8b90a4';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText(Math.ceil(remaining) + 's', trackX0, 24);
    };

    let raf = 0;
    let last: number | null = null;
    let roundT0: number | null = null;
    function tick(ts: number) {
      if (done) return;
      if (last == null) last = ts;
      if (roundT0 == null) roundT0 = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      zoneCenter = 0.3 + Math.sin((ts - roundT0) / 1400) * 0.15;
      zoneCenter = Math.max(0.12, Math.min(0.88, zoneCenter));
      vel += pressing * 2.6 * dt;
      vel *= 0.87;
      needle += vel * dt;
      needle = Math.max(0.02, Math.min(0.98, needle));
      const inZone = Math.abs(needle - zoneCenter) < ZONE_W / 2;
      if (inZone) {
        held += dt;
        heat = Math.max(0, heat - dt * 0.6);
        outTime = 0;
      } else {
        held = Math.max(0, held - dt * 1.5);
        outTime += dt;
        if (outTime > GRACE) heat = Math.min(1, heat + dt * HEAT_RATE);
        if (heat > 0.7 && !warned) {
          warned = true;
          gameSfx.warn();
        }
        if (heat < 0.5) warned = false;
      }
      draw();
      if (heat >= 1) {
        gameSfx.miss();
        finish(false);
        return;
      }
      if (held >= holdGoal) {
        gameSfx.hit();
        finish(true);
        return;
      }
      if ((performance.now() - startedAt) / 1000 >= timeLimit) {
        finish(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    draw();
    raf = requestAnimationFrame(tick);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
    };
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

// Idle preview - the needle drifts toward the same swaying zone on its own,
// no input, no heat-loss stakes. Ported verbatim from the deck's preview().
export function MiniGameReactorCalibrationPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx = ctx2d;

    let needle = 0.3;
    let zoneCenter = 0.3;
    let held = 0;
    let heat = 0;
    function heatColor(pct: number) {
      if (pct < 0.5) return '#4fe0c9';
      if (pct < 0.8) return '#f2c14e';
      return '#e8534b';
    }
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, w, h);
      const trackX0 = 50;
      const trackX1 = w - 50;
      ctx.strokeStyle = '#2a3040';
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(trackX0, cy);
      ctx.lineTo(trackX1, cy);
      ctx.stroke();
      const zoneW = 0.16 * (trackX1 - trackX0);
      const zx = trackX0 + zoneCenter * (trackX1 - trackX0);
      ctx.strokeStyle = held > 1.5 ? '#4fe0c9' : '#f2c14e';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(zx - zoneW / 2, cy);
      ctx.lineTo(zx + zoneW / 2, cy);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const nx = trackX0 + needle * (trackX1 - trackX0);
      ctx.fillStyle = '#f1efe6';
      ctx.beginPath();
      ctx.arc(nx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      const pct = Math.min(1, held / 2);
      ctx.fillStyle = '#4fe0c9';
      ctx.fillRect(trackX0, cy + 50, (trackX1 - trackX0) * pct, 10);
      ctx.strokeStyle = '#3a4054';
      ctx.strokeRect(trackX0, cy + 50, trackX1 - trackX0, 10);
      const hcol = heatColor(heat);
      ctx.fillStyle = '#1a1e28';
      ctx.fillRect(trackX0, cy + 76, trackX1 - trackX0, 14);
      ctx.fillStyle = hcol;
      ctx.fillRect(trackX0, cy + 76, (trackX1 - trackX0) * heat, 14);
      ctx.strokeStyle = '#3a4054';
      ctx.strokeRect(trackX0, cy + 76, trackX1 - trackX0, 14);
    };
    let raf = 0;
    let last: number | null = null;
    let t0: number | null = null;
    function tick(ts: number) {
      if (last == null) last = ts;
      if (t0 == null) t0 = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      zoneCenter = 0.3 + Math.sin((ts - t0) / 1400) * 0.15;
      zoneCenter = Math.max(0.12, Math.min(0.88, zoneCenter));
      needle += (zoneCenter - needle) * 2.2 * dt;
      const inZone = Math.abs(needle - zoneCenter) < 0.08;
      if (inZone) {
        held += dt;
        heat = Math.max(0, heat - dt * 0.6);
      } else {
        held = Math.max(0, held - dt);
        heat = Math.min(1, heat + dt * 0.15);
      }
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
      height={420}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '0.75rem' }}
    />
  );
}
