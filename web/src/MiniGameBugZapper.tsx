import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';
import { gameSfx } from './gameSfx';

// Real port of "Bug Zapper" from the Task Deck prototype (PLANNING.md §18)
// - tap each bug before it scurries off; reach the zap quota before time
// runs out. `timeLimit` enforced here (the deck's shared runClock harness
// doesn't exist in the real app).
export interface MiniGameBugZapperConfig extends MiniGameConfig {
  steps?: number; // zaps needed, 6-20, default 12
  timeLimit?: number; // seconds, default 18
  difficulty?: number; // 0 Easy / 1 Normal / 2 Hard, default 1 - on-screen dwell time
}

export default function MiniGameBugZapper({
  config,
  onFinish,
}: {
  config: MiniGameBugZapperConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const N = Math.max(3, Math.min(30, Math.floor(config.steps ?? 12)));
    const timeLimit = Math.max(5, config.timeLimit ?? 18);
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const LIFE_MULT = [1.35, 1, 0.72][difficulty];
    const life = Math.max(300, (950 - N * 25) * LIFE_MULT);

    let zapped = 0;
    let done = false;
    let spawnTimer = 0;
    let clockRaf = 0;
    const startedAt = performance.now();

    const clock = document.createElement('div');
    clock.style.cssText = 'position:absolute;top:8px;left:12px;font:600 13px monospace;color:#8b90a4;z-index:2;';
    stage.appendChild(clock);
    const counter = document.createElement('div');
    counter.style.cssText = 'position:absolute;top:8px;right:12px;font:600 13px monospace;color:#8b90a4;z-index:2;';
    stage.appendChild(counter);
    function updateCounter() {
      counter.textContent = `${zapped}/${N}`;
    }
    updateCounter();

    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({ won, stepsCompleted: zapped, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const spawn = () => {
      if (done) return;
      const bug = document.createElement('div');
      const x = 8 + Math.random() * 80;
      const y = 16 + Math.random() * 68;
      bug.textContent = '🪲';
      bug.style.cssText = `position:absolute;left:${x}%;top:${y}%;font-size:34px;cursor:pointer;transform:translate(-50%,-50%) scale(0.4);transition:transform 0.15s;touch-action:none;filter:drop-shadow(0 0 6px rgba(125,216,125,0.5));`;
      stage.appendChild(bug);
      requestAnimationFrame(() => {
        bug.style.transform = 'translate(-50%,-50%) scale(1)';
      });
      const escape = setTimeout(() => bug.remove(), life);
      bug.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        clearTimeout(escape);
        gameSfx.zap();
        bug.textContent = '⚡';
        bug.style.filter = 'drop-shadow(0 0 10px #f2c14e)';
        bug.style.transform = 'translate(-50%,-50%) scale(1.35)';
        setTimeout(() => {
          bug.style.transform = 'translate(-50%,-50%) scale(0)';
        }, 90);
        setTimeout(() => bug.remove(), 240);
        zapped++;
        updateCounter();
        if (zapped >= N) finish(true);
      });
      spawnTimer = window.setTimeout(spawn, 260 + Math.random() * 260);
    };
    spawn();

    const tickClock = () => {
      if (done) return;
      const remaining = Math.max(0, timeLimit - (performance.now() - startedAt) / 1000);
      clock.textContent = Math.ceil(remaining) + 's';
      clock.style.color = remaining < 6 ? '#ef5468' : '#8b90a4';
      if (remaining <= 0) {
        finish(false);
        return;
      }
      clockRaf = requestAnimationFrame(tickClock);
    };
    clockRaf = requestAnimationFrame(tickClock);

    return () => {
      if (spawnTimer) clearTimeout(spawnTimer);
      if (clockRaf) cancelAnimationFrame(clockRaf);
      stage.querySelectorAll('div').forEach((d) => d.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden', touchAction: 'none' }} />;
}

// Idle preview - bugs spawn and auto-zap themselves after a beat, no input,
// no scoring. Ported verbatim from the deck's own preview().
export function MiniGameBugZapperPreview() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let spawnTimer = 0;
    let cancelled = false;
    const spawn = () => {
      if (cancelled) return;
      const bug = document.createElement('div');
      const x = 8 + Math.random() * 80;
      const y = 8 + Math.random() * 74;
      bug.textContent = '🪲';
      bug.style.cssText = `position:absolute;left:${x}%;top:${y}%;font-size:34px;transform:translate(-50%,-50%) scale(0.4);transition:transform 0.15s;filter:drop-shadow(0 0 6px rgba(125,216,125,0.5));`;
      stage.appendChild(bug);
      requestAnimationFrame(() => {
        bug.style.transform = 'translate(-50%,-50%) scale(1)';
      });
      setTimeout(() => {
        bug.textContent = '⚡';
        bug.style.filter = 'drop-shadow(0 0 10px #f2c14e)';
        bug.style.transform = 'translate(-50%,-50%) scale(1.35)';
        setTimeout(() => {
          bug.style.transform = 'translate(-50%,-50%) scale(0)';
        }, 90);
        setTimeout(() => bug.remove(), 240);
      }, 500 + Math.random() * 500);
      spawnTimer = window.setTimeout(spawn, 420 + Math.random() * 260);
    };
    spawn();
    return () => {
      cancelled = true;
      clearTimeout(spawnTimer);
      stage.querySelectorAll('div').forEach((d) => d.remove());
    };
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}
