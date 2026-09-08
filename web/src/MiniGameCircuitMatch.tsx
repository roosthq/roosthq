import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';

// Real port of "Circuit Match" from the Task Deck prototype (PLANNING.md
// §18) - flip two tiles at a time, match the symbol to keep it, find every
// pair before time runs out. `timeLimit` enforced here (the deck's shared
// runClock harness doesn't exist in the real app).
export interface MiniGameCircuitMatchConfig extends MiniGameConfig {
  steps?: number; // pairs, 3-8, default 5
  timeLimit?: number; // seconds, default 35
  difficulty?: number; // 0 Easy (peek first) / 1 Normal / 2 Hard, default 1
}

const SYMBOLS = ['⚙️', '🔋', '💡', '🧲', '🛰️', '🔧', '📶', '🧯'];

export default function MiniGameCircuitMatch({
  config,
  onFinish,
}: {
  config: MiniGameCircuitMatchConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const N = Math.max(2, Math.min(8, Math.floor(config.steps ?? 5)));
    const timeLimit = Math.max(5, config.timeLimit ?? 35);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const MISMATCH_MS = [1100, 550, 300][difficulty];

    let done = false;
    let solved = 0;
    const startedAt = performance.now();
    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({ won, stepsCompleted: solved, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;height:100%;padding:12px;box-sizing:border-box;';
    const clock = document.createElement('div');
    clock.style.cssText = 'position:absolute;top:8px;left:12px;font:600 13px monospace;color:#8b90a4;';
    wrap.appendChild(clock);
    stage.appendChild(wrap);

    const cards: string[] = [];
    for (let i = 0; i < N; i++) {
      cards.push(SYMBOLS[i]);
      cards.push(SYMBOLS[i]);
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:92%;max-width:340px;';
    wrap.appendChild(grid);

    let open: HTMLDivElement[] = [];
    let lock = difficulty === 0;
    const tileEls = cards.map((sym) => {
      const tile = document.createElement('div');
      tile.style.cssText = 'aspect-ratio:1;border-radius:0.5rem;background:#22262f;border:2px solid #3a4054;display:flex;align-items:center;justify-content:center;font-size:1.4rem;cursor:pointer;transition:background 0.15s;touch-action:none;';
      tile.dataset.sym = sym;
      tile.dataset.state = 'closed';
      tile.addEventListener('pointerdown', () => {
        if (lock || tile.dataset.state !== 'closed' || done) return;
        tile.dataset.state = 'open';
        tile.textContent = sym;
        tile.style.background = '#2c3140';
        open.push(tile);
        if (open.length === 2) {
          lock = true;
          if (open[0].dataset.sym === open[1].dataset.sym) {
            open.forEach((t) => {
              t.dataset.state = 'solved';
              t.style.background = 'rgba(79,224,201,0.18)';
              t.style.borderColor = '#4fe0c9';
            });
            solved++;
            open = [];
            lock = false;
            if (solved >= N) finish(true);
          } else {
            setTimeout(() => {
              open.forEach((t) => {
                t.dataset.state = 'closed';
                t.textContent = '';
                t.style.background = '#22262f';
              });
              open = [];
              lock = false;
            }, MISMATCH_MS);
          }
        }
      });
      grid.appendChild(tile);
      return tile;
    });

    // Easy: flash every tile face-up for a beat before play starts.
    let peekTimer = 0;
    if (difficulty === 0) {
      tileEls.forEach((t) => {
        t.textContent = t.dataset.sym ?? '';
        t.style.background = '#2c3140';
      });
      peekTimer = window.setTimeout(() => {
        tileEls.forEach((t) => {
          if (t.dataset.state === 'closed') {
            t.textContent = '';
            t.style.background = '#22262f';
          }
        });
        lock = false;
      }, 1600);
    }

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
      if (peekTimer) clearTimeout(peekTimer);
      if (raf) cancelAnimationFrame(raf);
      stage.removeChild(wrap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden', touchAction: 'none' }} />;
}

// Idle preview - reveals a random matching pair, holds, closes, loops. No
// input, no scoring. Ported verbatim from the deck's own preview().
export function MiniGameCircuitMatchPreview() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const previewSymbols = ['⚙️', '🔋', '💡', '🧲', '🛰️', '🔧'];
    const N = 4;
    const cards: string[] = [];
    for (let i = 0; i < N; i++) {
      cards.push(previewSymbols[i]);
      cards.push(previewSymbols[i]);
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:12px;box-sizing:border-box;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:80%;max-width:280px;';
    wrap.appendChild(grid);
    stage.appendChild(wrap);
    const tiles = cards.map((sym) => {
      const tile = document.createElement('div');
      tile.style.cssText = 'aspect-ratio:1;border-radius:0.5rem;background:#22262f;border:2px solid #3a4054;display:flex;align-items:center;justify-content:center;font-size:1.3rem;transition:background 0.15s,border-color 0.15s;';
      grid.appendChild(tile);
      return { el: tile, sym };
    });
    let cancelled = false;
    let timer = 0;
    function pickPair(): number[] {
      const bySym: Record<string, number[]> = {};
      tiles.forEach((t, i) => {
        (bySym[t.sym] = bySym[t.sym] || []).push(i);
      });
      const groups = Object.values(bySym);
      return groups[Math.floor(Math.random() * groups.length)];
    }
    function reveal([a, b]: number[]) {
      if (cancelled) return;
      [a, b].forEach((i) => {
        tiles[i].el.textContent = tiles[i].sym;
        tiles[i].el.style.background = '#2c3140';
      });
      timer = window.setTimeout(() => {
        if (cancelled) return;
        [a, b].forEach((i) => {
          tiles[i].el.style.background = 'rgba(79,224,201,0.18)';
          tiles[i].el.style.borderColor = '#4fe0c9';
        });
        timer = window.setTimeout(() => {
          if (cancelled) return;
          [a, b].forEach((i) => {
            tiles[i].el.textContent = '';
            tiles[i].el.style.background = '#22262f';
            tiles[i].el.style.borderColor = '#3a4054';
          });
          timer = window.setTimeout(() => reveal(pickPair()), 500);
        }, 700);
      }, 500);
    }
    timer = window.setTimeout(() => reveal(pickPair()), 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stage.removeChild(wrap);
    };
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}
