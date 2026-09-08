import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';
import { gameSfx } from './gameSfx';

// Real port of "Signal Relay" (Simon-Says) from the Task Deck prototype
// (PLANNING.md §18) - watch the panel light up, then repeat the sequence;
// it grows by one pad every round survived. `timeLimit` is enforced here
// (the deck's own shared `runClock` harness doesn't exist in the real app,
// same gap MiniGamePinTumbler/MiniGameWireSplice already had to fill in).
export interface MiniGameSignalRelayConfig extends MiniGameConfig {
  steps?: number; // rounds to win, 4-10, default 6
  timeLimit?: number; // seconds, default 40
  colors?: number; // 3-6 pads, default 4
  difficulty?: number; // 0 Easy / 1 Normal / 2 Hard, default 1 - playback pace
}

const COLORS = ['#ef5468', '#f2c14e', '#5ec8f2', '#7dd87d', '#c77dff', '#f28c5e'];
const FREQ = [329.6, 392.0, 261.6, 220.0, 293.7, 246.9];

export default function MiniGameSignalRelay({
  config,
  onFinish,
}: {
  config: MiniGameSignalRelayConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const N = Math.max(3, Math.min(12, Math.floor(config.steps ?? 6)));
    const timeLimit = Math.max(5, config.timeLimit ?? 40);
    const count = Math.max(3, Math.min(6, Math.floor(config.colors ?? 4)));
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    // Difficulty tunes playback pace, not the sequence length - Hard shows
    // each step faster and holds it lit for less time.
    const PACE = [
      { gap: 520, lit: 380 },
      { gap: 420, lit: 320 },
      { gap: 300, lit: 220 },
    ][difficulty];

    let done = false;
    let cancelled = false;
    const startedAt = performance.now();
    function finish(won: boolean, stepsCompleted: number) {
      if (done) return;
      done = true;
      cancelled = true;
      onFinishRef.current({ won, stepsCompleted, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;height:100%;';
    const hint = document.createElement('div');
    hint.style.cssText = 'font:600 13px sans-serif;color:#8b90a4;';
    hint.textContent = 'Watch closely…';
    const clock = document.createElement('div');
    clock.style.cssText = 'position:absolute;top:8px;left:12px;font:600 13px monospace;color:#8b90a4;';
    wrap.appendChild(clock);
    wrap.appendChild(hint);
    const cols = count <= 4 ? 2 : 3;
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;width:86%;max-width:300px;`;
    const pads: HTMLDivElement[] = [];
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.style.cssText = `height:4.4rem;border-radius:14px;background:${COLORS[i]};opacity:0.35;cursor:pointer;transition:opacity 0.1s;touch-action:none;`;
      grid.appendChild(d);
      pads.push(d);
    }
    wrap.appendChild(grid);
    stage.appendChild(wrap);

    let seq: number[] = [];
    let userIdx = 0;
    let accepting = false;

    function lightUp(i: number, dur?: number) {
      pads[i].style.opacity = '1';
      setTimeout(() => {
        if (!cancelled) pads[i].style.opacity = '0.35';
      }, dur || PACE.lit);
    }
    async function playSeq() {
      accepting = false;
      userIdx = 0;
      for (let i = 0; i < seq.length; i++) {
        await new Promise((r) => setTimeout(r, PACE.gap));
        if (cancelled) return;
        lightUp(seq[i]);
        gameSfx.note(FREQ[seq[i]], 0.3);
      }
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      accepting = true;
      hint.textContent = 'Your turn - repeat it';
    }
    function nextRound() {
      if (cancelled) return;
      seq.push(Math.floor(Math.random() * count));
      hint.textContent = 'Watch closely…';
      playSeq();
    }
    pads.forEach((pad, i) => {
      pad.addEventListener('pointerdown', () => {
        if (!accepting || done) return;
        lightUp(i, 180);
        gameSfx.note(FREQ[i], 0.3);
        if (seq[userIdx] === i) {
          userIdx++;
          if (userIdx === seq.length) {
            accepting = false;
            gameSfx.hit();
            if (seq.length >= N) {
              finish(true, seq.length);
              return;
            }
            setTimeout(nextRound, 600);
          }
        } else {
          accepting = false;
          gameSfx.miss();
          finish(false, seq.length - 1);
        }
      });
    });
    nextRound();

    let raf = 0;
    function tick() {
      if (done) return;
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      clock.textContent = Math.ceil(remaining) + 's';
      clock.style.color = remaining < 6 ? '#ef5468' : '#8b90a4';
      if (remaining <= 0) {
        finish(false, seq.length - (accepting ? 0 : 1));
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stage.removeChild(wrap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden', touchAction: 'none' }} />;
}

// Idle preview - a fixed 4-pad demo sequence loops forever, no input, no
// scoring. Ported verbatim from the prototype's own `preview()`.
export function MiniGameSignalRelayPreview() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const previewColors = ['#ef5468', '#f2c14e', '#5ec8f2', '#7dd87d'];
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;width:80%;max-width:280px;aspect-ratio:1;';
    const pads = previewColors.map((c) => {
      const d = document.createElement('div');
      d.style.cssText = `border-radius:14px;background:${c};opacity:0.35;transition:opacity 0.12s;`;
      grid.appendChild(d);
      return d;
    });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;';
    wrap.appendChild(grid);
    stage.appendChild(wrap);
    const demoSeq = [0, 1, 2, 3, 0, 2, 1, 3];
    let i = 0;
    let cancelled = false;
    let timer = 0;
    function step() {
      if (cancelled) return;
      const pad = pads[demoSeq[i % demoSeq.length]];
      pad.style.opacity = '1';
      setTimeout(() => {
        if (!cancelled) pad.style.opacity = '0.35';
      }, 260);
      i++;
      timer = window.setTimeout(step, 420);
    }
    step();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stage.removeChild(wrap);
    };
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}
