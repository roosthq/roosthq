import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';

// Real port of "Cargo Sort" from the Task Deck prototype (PLANNING.md §18) -
// drag the scrambled crates into ascending order (1..N) before the loading
// clock runs out. Easy starts only a few swaps from solved; Hard hides
// every crate's number until you actually touch it (a memory game on top
// of the sort). `timeLimit` enforced here, same gap every port has had to
// fill in for the deck's own shared `runClock` harness.
export interface MiniGameCargoSortConfig extends MiniGameConfig {
  steps?: number; // crate count, 4-8, default 6
  timeLimit?: number; // seconds, default 25
  difficulty?: number; // 0 Easy / 1 Normal / 2 Hard (numbers hidden), default 1
}

const SIZE_BY_N: Record<number, string> = { 4: '3.4rem', 5: '3.1rem', 6: '2.8rem', 7: '2.5rem', 8: '2.2rem' };
const GAP_BY_N: Record<number, string> = { 4: '0.7rem', 5: '0.6rem', 6: '0.55rem', 7: '0.45rem', 8: '0.35rem' };
const CRATE_CSS =
  'position:relative;flex-shrink:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;' +
  'border-radius:0.3rem;background:linear-gradient(155deg,#c99a5f,#a97640 55%,#8f5f30);border:2px solid #6b4423;' +
  'box-shadow:inset 0 0 0 3px rgba(0,0,0,0.15),0 2px 4px rgba(0,0,0,0.35);cursor:grab;touch-action:none;transition:border-color 0.15s,box-shadow 0.15s;';
const NUM_CSS =
  'position:relative;font-family:monospace;font-weight:700;color:#241705;background:rgba(255,244,222,0.85);' +
  'padding:0.05rem 0.32rem;border-radius:0.2rem;box-shadow:0 0 0 1px rgba(0,0,0,0.2);';

export default function MiniGameCargoSort({
  config,
  onFinish,
}: {
  config: MiniGameCargoSortConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const N = Math.max(3, Math.min(10, Math.floor(config.steps ?? 6)));
    const timeLimit = Math.max(5, config.timeLimit ?? 25);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));

    let vals = [...Array(N).keys()].map((n) => n + 1);
    if (difficulty === 0) {
      const swaps = Math.max(1, Math.ceil(N / 2));
      for (let s = 0; s < swaps; s++) {
        const a = Math.floor(Math.random() * N);
        const b = Math.floor(Math.random() * N);
        [vals[a], vals[b]] = [vals[b], vals[a]];
      }
    } else {
      for (let i = vals.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [vals[i], vals[j]] = [vals[j], vals[i]];
      }
    }
    const hideNumbers = difficulty === 2;
    const revealed = new Array(N).fill(!hideNumbers);

    let done = false;
    const startedAt = performance.now();
    function finish(won: boolean) {
      if (done) return;
      done = true;
      const steps = vals.filter((v, i) => v === i + 1).length;
      onFinishRef.current({ won, stepsCompleted: steps, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;width:100%;height:100%;';
    const clock = document.createElement('div');
    clock.style.cssText = 'position:absolute;top:8px;left:12px;font:600 13px monospace;color:#8b90a4;';
    wrap.appendChild(clock);
    const row = document.createElement('div');
    row.style.cssText = `display:flex;flex-wrap:nowrap;justify-content:center;width:100%;gap:${GAP_BY_N[N] || '0.5rem'};`;
    wrap.appendChild(row);
    stage.appendChild(wrap);

    const size = SIZE_BY_N[N] || '2.6rem';
    const crateEls: HTMLDivElement[] = [];
    const numEls: HTMLSpanElement[] = [];
    for (let i = 0; i < N; i++) {
      const crate = document.createElement('div');
      crate.style.cssText = `${CRATE_CSS}width:${size};height:${size};`;
      const num = document.createElement('span');
      num.style.cssText = `${NUM_CSS}font-size:${N >= 7 ? '0.9rem' : '1.05rem'};`;
      crate.appendChild(num);
      row.appendChild(crate);
      crateEls.push(crate);
      numEls.push(num);
    }

    let dragIdx: number | null = null;
    function paint(i: number) {
      const v = vals[i];
      const correct = v === i + 1;
      numEls[i].textContent = revealed[i] ? String(v) : '?';
      const good = revealed[i] && correct;
      crateEls[i].style.borderColor = good ? '#2f8f6b' : '#6b4423';
      crateEls[i].style.boxShadow = good
        ? 'inset 0 0 0 3px rgba(79,224,201,0.3), 0 0 10px -2px #4fe0c9'
        : 'inset 0 0 0 3px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.35)';
      numEls[i].style.background = good ? '#d8fff2' : 'rgba(255,244,222,0.85)';
      numEls[i].style.color = good ? '#0e4a3a' : '#241705';
    }
    function paintAll() {
      for (let i = 0; i < N; i++) paint(i);
      if (vals.every((v, i) => v === i + 1)) finish(true);
    }
    crateEls.forEach((el, i) => {
      el.addEventListener('pointerdown', (e) => {
        if (done) return;
        dragIdx = i;
        revealed[i] = true;
        paint(i);
        el.style.opacity = '0.55';
        el.style.cursor = 'grabbing';
        e.preventDefault();
      });
    });
    function onMove(e: PointerEvent) {
      if (dragIdx == null || done) return;
      for (let i = 0; i < N; i++) {
        const r = crateEls[i].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          if (i !== dragIdx) {
            const tmp = vals[dragIdx];
            vals[dragIdx] = vals[i];
            vals[i] = tmp;
            revealed[dragIdx] = true;
            revealed[i] = true;
            crateEls[dragIdx].style.opacity = '';
            crateEls[dragIdx].style.cursor = 'grab';
            dragIdx = i;
            crateEls[dragIdx].style.opacity = '0.55';
            crateEls[dragIdx].style.cursor = 'grabbing';
            paintAll();
          }
          break;
        }
      }
    }
    function onUp() {
      if (dragIdx !== null) {
        crateEls[dragIdx].style.opacity = '';
        crateEls[dragIdx].style.cursor = 'grab';
        dragIdx = null;
      }
    }
    row.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    paintAll();

    let raf = 0;
    function tick() {
      if (done) return;
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      clock.textContent = Math.ceil(remaining) + 's';
      clock.style.color = remaining < 6 ? '#ef5468' : '#8b90a4';
      if (remaining <= 0) {
        finish(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      row.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
      stage.removeChild(wrap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden', touchAction: 'none' }} />;
}

// Idle preview - one crate swap at a time, autonomous, matching the deck's
// own preview() (a slower, gentler version of the real shuffle).
export function MiniGameCargoSortPreview() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const N = 5;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:nowrap;justify-content:center;width:100%;gap:0.6rem;';
    wrap.appendChild(row);
    stage.appendChild(wrap);
    const vals = [1, 2, 3, 4, 5];
    const crateEls: HTMLDivElement[] = [];
    const numEls: HTMLSpanElement[] = [];
    for (let i = 0; i < N; i++) {
      const crate = document.createElement('div');
      crate.style.cssText = `${CRATE_CSS}width:3.1rem;height:3.1rem;cursor:default;`;
      const num = document.createElement('span');
      num.style.cssText = `${NUM_CSS}font-size:1.05rem;`;
      crate.appendChild(num);
      row.appendChild(crate);
      crateEls.push(crate);
      numEls.push(num);
    }
    function paint() {
      vals.forEach((v, i) => {
        numEls[i].textContent = String(v);
        const good = v === i + 1;
        crateEls[i].style.borderColor = good ? '#2f8f6b' : '#6b4423';
        crateEls[i].style.boxShadow = good ? 'inset 0 0 0 3px rgba(79,224,201,0.3), 0 0 10px -2px #4fe0c9' : 'inset 0 0 0 3px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.35)';
        numEls[i].style.background = good ? '#d8fff2' : 'rgba(255,244,222,0.85)';
        numEls[i].style.color = good ? '#0e4a3a' : '#241705';
      });
    }
    paint();
    let cancelled = false;
    let timer = 0;
    function shuffleSwap() {
      if (cancelled) return;
      const a = Math.floor(Math.random() * N);
      const b = (a + 1 + Math.floor(Math.random() * (N - 1))) % N;
      [vals[a], vals[b]] = [vals[b], vals[a]];
      paint();
      timer = window.setTimeout(() => {
        if (cancelled) return;
        [vals[a], vals[b]] = [vals[b], vals[a]];
        paint();
        timer = window.setTimeout(shuffleSwap, 1400);
      }, 900);
    }
    timer = window.setTimeout(shuffleSwap, 1400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stage.removeChild(wrap);
    };
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}
