import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';
import { gameSfx } from './gameSfx';

// Real port of "Wire Splice" from the Task Deck prototype (PLANNING.md §18)
// - drag each colored lead on the left to its matching post on the right
// before the timer runs out. DOM + SVG, not canvas, like the prototype -
// wires are little verlet ropes (gravity + a few distance-constraint relax
// passes per frame) so they hang and swing instead of drawing as straight
// lines. `finish`'s time-limit check is the deck's own shared `runClock`
// harness, which doesn't exist in the real app - reimplemented inline here,
// same as MiniGamePinTumbler already had to.
export interface MiniGameWireSpliceConfig extends MiniGameConfig {
  steps?: number; // wire count, 3-7, default 5
  timeLimit?: number; // seconds, default 20
  difficulty?: number; // 0 Easy / 1 Normal / 2 Hard, default 1 - post snap radius
}

const COLORS = ['#ef5468', '#f2c14e', '#5ec8f2', '#4fe0c9', '#c77dff', '#f28c5e', '#7dd87d'];

export default function MiniGameWireSplice({
  config,
  onFinish,
}: {
  config: MiniGameWireSpliceConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const N = Math.max(2, Math.min(7, Math.floor(config.steps ?? 5)));
    const timeLimit = Math.max(5, config.timeLimit ?? 20);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const SNAP_R = [55, 40, 28][difficulty];

    const order = [...Array(N).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    wrap.appendChild(svg);
    stage.appendChild(wrap);

    const clock = document.createElement('div');
    clock.style.cssText = 'position:absolute;top:8px;left:12px;font:600 13px monospace;color:#8b90a4;';
    wrap.appendChild(clock);

    let done = false;
    const startedAt = performance.now();
    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({
        won,
        stepsCompleted: connected.filter(Boolean).length,
        totalSteps: N,
        timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000),
      });
    }

    const leftPosts: { el: HTMLDivElement; x: number; y: number; color: string }[] = [];
    const rightPosts: { el: HTMLDivElement; x: number; y: number; color: number }[] = [];
    const connected = new Array(N).fill(false);
    const H = stage.clientHeight || 340;
    const pad = 36;
    const spacing = (H - pad * 2) / (N - 1 || 1);
    for (let i = 0; i < N; i++) {
      const ly = pad + i * spacing;
      const l = document.createElement('div');
      l.style.cssText = `position:absolute;left:8%;top:${ly}px;width:26px;height:26px;border-radius:50%;background:${COLORS[i]};box-shadow:0 0 10px ${COLORS[i]};cursor:grab;transform:translate(-50%,-50%);touch-action:none;`;
      wrap.appendChild(l);
      leftPosts.push({ el: l, x: 0, y: ly, color: COLORS[i] });
    }
    for (let slot = 0; slot < N; slot++) {
      const ry = pad + slot * spacing;
      const colorIdx = order[slot];
      const r = document.createElement('div');
      r.style.cssText = `position:absolute;left:92%;top:${ry}px;width:26px;height:26px;border-radius:50%;background:#0c0e14;border:3px solid ${COLORS[colorIdx]};transform:translate(-50%,-50%);transition:background 0.15s;`;
      wrap.appendChild(r);
      rightPosts.push({ el: r, x: 0, y: ry, color: colorIdx });
    }
    function positions() {
      const rect = wrap.getBoundingClientRect();
      leftPosts.forEach((p) => {
        const b = p.el.getBoundingClientRect();
        p.x = b.left - rect.left + b.width / 2;
        p.y = b.top - rect.top + b.height / 2;
      });
      rightPosts.forEach((p) => {
        const b = p.el.getBoundingClientRect();
        p.x = b.left - rect.left + b.width / 2;
        p.y = b.top - rect.top + b.height / 2;
      });
    }

    const SEGS = 10;
    const GRAVITY = 230;
    const DAMPING = 0.985;
    const SLACK = 1.05;
    const ITER = 4;
    type Pt = { x: number; y: number };
    type Rope = { pts: Pt[]; prev: Pt[] };
    const ropes: (Rope | null)[] = new Array(N).fill(null);
    const ropePaths: (SVGPathElement | null)[] = new Array(N).fill(null);
    function ropePath(i: number) {
      if (!ropePaths[i]) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('stroke', leftPosts[i].color);
        p.setAttribute('stroke-width', '5');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
        ropePaths[i] = p;
      }
      return ropePaths[i]!;
    }
    function makeRope(ax: number, ay: number, bx: number, by: number): Rope {
      const pts: Pt[] = [];
      const prev: Pt[] = [];
      for (let k = 0; k <= SEGS; k++) {
        const t = k / SEGS;
        const pt = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
        pts.push(pt);
        prev.push({ x: pt.x, y: pt.y });
      }
      return { pts, prev };
    }
    function stepRope(rope: Rope, ax: number, ay: number, bx: number, by: number, dt: number) {
      const pts = rope.pts;
      const prev = rope.prev;
      for (let k = 1; k < SEGS; k++) {
        const p = pts[k];
        const pp = prev[k];
        const vx = (p.x - pp.x) * DAMPING;
        const vy = (p.y - pp.y) * DAMPING;
        prev[k] = { x: p.x, y: p.y };
        pts[k] = { x: p.x + vx, y: p.y + vy + GRAVITY * dt * dt };
      }
      pts[0] = { x: ax, y: ay };
      pts[SEGS] = { x: bx, y: by };
      const straight = Math.hypot(bx - ax, by - ay);
      const rest = (straight * SLACK) / SEGS;
      for (let iter = 0; iter < ITER; iter++) {
        for (let k = 0; k < SEGS; k++) {
          const p1 = pts[k];
          const p2 = pts[k + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = ((d - rest) / d) * 0.5;
          const ox = dx * diff;
          const oy = dy * diff;
          if (k > 0) {
            p1.x += ox;
            p1.y += oy;
          }
          if (k + 1 < SEGS) {
            p2.x -= ox;
            p2.y -= oy;
          }
        }
        pts[0] = { x: ax, y: ay };
        pts[SEGS] = { x: bx, y: by };
      }
    }
    function renderRope(i: number) {
      const pts = ropes[i]!.pts;
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let k = 1; k <= SEGS; k++) d += ` L ${pts[k].x} ${pts[k].y}`;
      ropePath(i).setAttribute('d', d);
    }

    let pointerX = 0;
    let pointerY = 0;
    let draggingIdx: number | null = null;
    let physRaf = 0;
    let physLast: number | null = null;
    function physTick(ts: number) {
      if (done) return;
      if (physLast == null) physLast = ts;
      const dt = Math.min(0.032, (ts - physLast) / 1000);
      physLast = ts;
      for (let i = 0; i < N; i++) {
        if (!ropes[i]) continue;
        const ax = leftPosts[i].x;
        const ay = leftPosts[i].y;
        let bx: number, by: number;
        if (connected[i]) {
          const rp = rightPosts[order.indexOf(i)];
          bx = rp.x;
          by = rp.y;
        } else if (i === draggingIdx) {
          bx = pointerX;
          by = pointerY;
        } else continue;
        stepRope(ropes[i]!, ax, ay, bx, by, dt);
        renderRope(i);
      }
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      clock.textContent = Math.ceil(remaining) + 's';
      clock.style.color = remaining < 6 ? '#ef5468' : '#8b90a4';
      if (remaining <= 0) {
        finish(false);
        return;
      }
      physRaf = requestAnimationFrame(physTick);
    }
    physRaf = requestAnimationFrame(physTick);

    function onDown(i: number) {
      return (e: PointerEvent) => {
        if (done || connected[i]) return;
        positions();
        draggingIdx = i;
        pointerX = leftPosts[i].x;
        pointerY = leftPosts[i].y;
        if (!ropes[i]) ropes[i] = makeRope(leftPosts[i].x, leftPosts[i].y, pointerX, pointerY);
        gameSfx.click();
        e.preventDefault();
      };
    }
    function onMove(e: PointerEvent) {
      if (draggingIdx == null) return;
      const rect = wrap.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
    }
    function onUp(e: PointerEvent) {
      if (draggingIdx == null || done) return;
      positions();
      const idx = draggingIdx;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let best: { el: HTMLDivElement; x: number; y: number; color: number } | null = null;
      let bestD = SNAP_R;
      for (const p of rightPosts) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best && best.color === idx && !connected[idx]) {
        gameSfx.hit();
        connected[idx] = true;
        best.el.style.background = COLORS[idx];
        if (connected.every(Boolean)) finish(true);
      } else {
        if (best) gameSfx.miss();
        ropes[idx] = null;
        if (ropePaths[idx]) {
          svg.removeChild(ropePaths[idx]!);
          ropePaths[idx] = null;
        }
      }
      draggingIdx = null;
    }
    leftPosts.forEach((p, i) => p.el.addEventListener('pointerdown', onDown(i)));
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);

    return () => {
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      if (physRaf) cancelAnimationFrame(physRaf);
      stage.removeChild(wrap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden', touchAction: 'none' }} />;
}

// Idle preview - a lead sweeps from its left post to the matching right
// post, "plugs in", then settles into a calm sag; once every wire's
// connected, pause, reset, loop. Ported verbatim from the prototype's own
// `preview()`.
export function MiniGameWireSplicePreview() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const N = 5;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;';
    wrap.appendChild(svg);
    stage.appendChild(wrap);
    const H = stage.clientHeight || 340;
    const pad = 36;
    const bottomMargin = 44;
    const spacing = (H - pad * 2 - bottomMargin) / (N - 1);
    const wires: { path: SVGPathElement; rightEl: HTMLDivElement; y: number; phase: number }[] = [];
    for (let i = 0; i < N; i++) {
      const y = pad + i * spacing;
      const l = document.createElement('div');
      l.style.cssText = `position:absolute;left:8%;top:${y}px;width:22px;height:22px;border-radius:50%;background:${COLORS[i]};box-shadow:0 0 8px ${COLORS[i]};transform:translate(-50%,-50%);`;
      wrap.appendChild(l);
      const r = document.createElement('div');
      r.style.cssText = `position:absolute;left:92%;top:${y}px;width:22px;height:22px;border-radius:50%;background:#0c0e14;border:3px solid ${COLORS[i]};transform:translate(-50%,-50%);transition:background 0.15s;`;
      wrap.appendChild(r);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('stroke', COLORS[i]);
      p.setAttribute('stroke-width', '4');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
      wires.push({ path: p, rightEl: r, y, phase: Math.random() * Math.PI * 2 });
    }
    let connectedUpTo = -1;
    let animT = 0;
    let pauseT = 0;
    let raf = 0;
    let last: number | null = null;
    let t0: number | null = null;
    function reset() {
      connectedUpTo = -1;
      wires.forEach((w) => (w.rightEl.style.background = '#0c0e14'));
    }
    function tick(ts: number) {
      if (last == null) {
        last = ts;
        t0 = ts;
      }
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const t = (ts - t0!) / 1000;
      const rect = wrap.getBoundingClientRect();
      const leftX = rect.width * 0.08;
      const rightX = rect.width * 0.92;
      const animIdx = connectedUpTo + 1;
      if (animIdx < N) {
        animT = Math.min(1, animT + dt / 0.7);
        if (animT >= 1) {
          connectedUpTo = animIdx;
          animT = 0;
          wires[animIdx].rightEl.style.background = COLORS[animIdx];
        }
      } else {
        pauseT += dt;
        if (pauseT > 1.2) {
          pauseT = 0;
          reset();
        }
      }
      wires.forEach((wire, i) => {
        const sway = Math.sin(t * 0.8 + wire.phase) * 3;
        const sag = Math.min(18, spacing * 0.3);
        if (i <= connectedUpTo) {
          const midY = wire.y + sag + sway;
          wire.path.setAttribute('d', `M ${leftX} ${wire.y} Q ${(leftX + rightX) / 2} ${midY} ${rightX} ${wire.y}`);
        } else if (i === animIdx) {
          const ease = animT < 0.5 ? 2 * animT * animT : 1 - Math.pow(-2 * animT + 2, 2) / 2;
          const ex = leftX + (rightX - leftX) * ease;
          const ey = wire.y + sag * ease;
          wire.path.setAttribute('d', `M ${leftX} ${wire.y} Q ${(leftX + ex) / 2} ${wire.y + sag * ease * 0.6} ${ex} ${ey}`);
        } else {
          wire.path.setAttribute('d', '');
        }
      });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeChild(wrap);
    };
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}
