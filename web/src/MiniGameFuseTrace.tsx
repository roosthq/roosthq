import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';

// Real port of "Fuse Trace" from the Task Deck prototype (PLANNING.md §18)
// - drag the live wire from spark to socket without touching the rails;
// multiple stages, each a fresh randomized layout. `timeLimit` enforced
// here (the deck's shared runClock harness doesn't exist in the real app).
//
// One fix over the prototype: its own CHANNEL_W-by-difficulty array was
// computed but never actually used - the real channel width was hardcoded
// to 46 regardless of the difficulty slider. Wired difficulty to the
// channel width here instead of porting that dead code verbatim.
export interface MiniGameFuseTraceConfig extends MiniGameConfig {
  steps?: number; // stage count, 1-6, default 3
  timeLimit?: number; // seconds, default 25
  difficulty?: number; // 0 Easy (wide channel) / 1 Normal / 2 Hard (thin), default 1
}

type Pt = { x: number; y: number };

export default function MiniGameFuseTrace({
  config,
  onFinish,
}: {
  config: MiniGameFuseTraceConfig;
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

    const N = Math.max(1, Math.min(8, Math.floor(config.steps ?? 3)));
    const timeLimit = Math.max(5, config.timeLimit ?? 25);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const channelW = [64, 46, 32][difficulty];

    let stageIdx = 0;
    const genPath = (): Pt[] => {
      const segs = 4 + Math.floor(Math.random() * 3);
      const pts: Pt[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const edge = i === 0 || i === segs;
        pts.push({ x: 40 + (canvas.width - 80) * t, y: 200 + (edge ? 0 : (Math.random() * 2 - 1) * 130) });
      }
      return pts;
    };
    let pts = genPath();
    let tracing = false;
    let progress = 0;
    let failing = false;
    let trail: Pt[] = [];
    let done = false;
    const startedAt = performance.now();

    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({ won, stepsCompleted: stageIdx, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    function dist2seg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      return { d: Math.hypot(px - cx, py - cy), t };
    }
    function nearestT(px: number, py: number) {
      let best = { d: Infinity, tt: 0 };
      const lens: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) lens.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y));
      const total = lens.reduce((a, b) => a + b, 0);
      let cum = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const r = dist2seg(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (r.d < best.d) best = { d: r.d, tt: (cum + r.t * lens[i]) / total };
        cum += lens[i];
      }
      return best;
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = channelW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = failing ? 'rgba(239,84,104,0.28)' : 'rgba(125,216,125,0.14)';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.strokeStyle = failing ? '#ef5468' : '#7dd87d';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5ec8f2';
      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 12, 0, Math.PI * 2);
      ctx.fill();
      if (trail.length > 1) {
        ctx.strokeStyle = failing ? '#ef5468' : '#f1efe6';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        trail.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
      ctx.fillStyle = failing ? '#ef5468' : '#7dd87d';
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Stage ${stageIdx + 1}/${N} · ${Math.round(progress * 100)}%`, canvas.width / 2, 30);
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      ctx.textAlign = 'left';
      ctx.fillStyle = remaining < 6 ? '#ef5468' : '#8b90a4';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText(Math.ceil(remaining) + 's', 16, 24);
    };

    const toCanvasPt = (e: PointerEvent): Pt => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    };
    function onDown(e: PointerEvent) {
      if (done) return;
      const p = toCanvasPt(e);
      const near = nearestT(p.x, p.y);
      if (near.d < channelW && near.tt < 0.08) {
        tracing = true;
        progress = near.tt;
        trail = [p];
      }
    }
    let failTimer = 0;
    function fail() {
      if (done || failing) return;
      failing = true;
      tracing = false;
      draw();
      failTimer = window.setTimeout(() => finish(false), 280);
    }
    function clearedStage() {
      tracing = false;
      stageIdx++;
      if (stageIdx >= N) {
        finish(true);
        return;
      }
      pts = genPath();
      progress = 0;
      trail = [];
      draw();
    }
    function onMove(e: PointerEvent) {
      if (!tracing || done) return;
      const p = toCanvasPt(e);
      trail.push(p);
      const near = nearestT(p.x, p.y);
      if (near.d > channelW / 2) {
        fail();
        return;
      }
      if (near.tt > progress) progress = near.tt;
      draw();
      if (progress > 0.985) clearedStage();
    }
    function onUp() {
      tracing = false;
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    draw();

    let raf = 0;
    function tick() {
      if (done) return;
      draw();
      const remaining = timeLimit - (performance.now() - startedAt) / 1000;
      if (remaining <= 0) {
        finish(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (failTimer) clearTimeout(failTimer);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={400}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '0.75rem', touchAction: 'none' }}
    />
  );
}

// Idle preview - a bright point sweeps back and forth along a fixed
// randomized path, no input, no scoring. Ported verbatim from the deck's
// own preview().
export function MiniGameFuseTracePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx = ctx2d;

    const genPath = (): Pt[] => {
      const segs = 5;
      const pts: Pt[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const edge = i === 0 || i === segs;
        pts.push({ x: 40 + (canvas.width - 80) * t, y: 200 + (edge ? 0 : (Math.random() * 2 - 1) * 110) });
      }
      return pts;
    };
    const pts = genPath();
    function pointAt(t: number): Pt {
      const lens: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) lens.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y));
      const total = lens.reduce((a, b) => a + b, 0);
      const target = t * total;
      let cum = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        if (target <= cum + lens[i] || i === pts.length - 2) {
          const lt = lens[i] ? (target - cum) / lens[i] : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * lt, y: pts[i].y + (pts[i + 1].y - pts[i].y) * lt };
        }
        cum += lens[i];
      }
      return pts[0];
    }
    const draw = (prog: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 46;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(125,216,125,0.14)';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.strokeStyle = '#7dd87d';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5ec8f2';
      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 12, 0, Math.PI * 2);
      ctx.fill();
      const p = pointAt(prog);
      ctx.fillStyle = '#f1efe6';
      ctx.shadowColor = '#7dd87d';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    let raf = 0;
    let t0: number | null = null;
    function tick(ts: number) {
      if (t0 == null) t0 = ts;
      const t = (ts - t0) / 1000;
      const cycle = 3.2;
      const phase = (t % cycle) / cycle;
      const prog = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      draw(prog);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={400}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '0.75rem' }}
    />
  );
}
