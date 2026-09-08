import { useEffect, useRef } from 'react';
import type { MiniGameConfig } from './api';
import type { MiniGamePlayReport } from './MiniGamePinTumbler';

// Real port of "Code Breaker" (Mastermind-lite) from the Task Deck
// prototype (PLANNING.md §18) - guess the hidden digit code; green = right
// digit right spot, yellow = right digit wrong spot. `timeLimit` enforced
// here (the deck's shared runClock harness doesn't exist in the real app).
export interface MiniGameCodeBreakerConfig extends MiniGameConfig {
  steps?: number; // code length, 3-5, default 4
  timeLimit?: number; // seconds, default 50
  guesses?: number; // max guesses, 4-10, default 7
  difficulty?: number; // 0 Easy(0-3) / 1 Normal(0-5) / 2 Hard(0-7), default 1 - digit range
}

function legendEl() {
  const legend = document.createElement('div');
  legend.style.cssText = "display:flex;gap:0.9rem;flex-wrap:wrap;justify-content:center;font-family:monospace;font-size:0.66rem;color:#8b90a4;";
  legend.innerHTML = '<span>🟢 right digit, right spot</span><span>🟡 right digit, wrong spot</span>';
  return legend;
}
function btnCss() {
  return 'width:2.4rem;height:1.8rem;border-radius:0.3rem;border:1px solid #3a4054;background:#181c26;color:#f1efe6;cursor:pointer;font-size:0.8rem;';
}

export default function MiniGameCodeBreaker({
  config,
  onFinish,
}: {
  config: MiniGameCodeBreakerConfig;
  onFinish: (report: MiniGamePlayReport) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const N = Math.max(2, Math.min(6, Math.floor(config.steps ?? 4)));
    const timeLimit = Math.max(10, config.timeLimit ?? 50);
    const maxGuesses = Math.max(1, Math.floor(config.guesses ?? 7));
    const difficulty = Math.max(0, Math.min(2, Math.floor(config.difficulty ?? 1)));
    const RANGE = [4, 6, 8][difficulty];

    const code = Array.from({ length: N }, () => Math.floor(Math.random() * RANGE));
    const guess = new Array(N).fill(0);
    let triesLeft = maxGuesses;
    let bestCorrect = 0;
    let done = false;
    const startedAt = performance.now();

    function finish(won: boolean) {
      if (done) return;
      done = true;
      onFinishRef.current({ won, stepsCompleted: bestCorrect, totalSteps: N, timeTakenSeconds: Math.round((performance.now() - startedAt) / 1000) });
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;gap:0.8rem;align-items:center;justify-content:center;box-sizing:border-box;padding:16px;';
    const clock = document.createElement('div');
    clock.style.cssText = 'position:absolute;top:8px;left:12px;font:600 13px monospace;color:#8b90a4;';
    wrap.appendChild(clock);
    stage.appendChild(wrap);

    const guessRow = document.createElement('div');
    guessRow.style.cssText = 'display:flex;gap:8px;';
    const digitEls: HTMLDivElement[] = [];
    for (let i = 0; i < N; i++) {
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';
      const up = document.createElement('button');
      up.textContent = '▲';
      up.style.cssText = btnCss();
      const val = document.createElement('div');
      val.textContent = '0';
      val.style.cssText = 'width:2.4rem;height:2.4rem;display:flex;align-items:center;justify-content:center;border-radius:0.4rem;background:#22262f;border:2px solid #3a4054;font-family:monospace;font-weight:700;font-size:1.2rem;';
      const down = document.createElement('button');
      down.textContent = '▼';
      down.style.cssText = btnCss();
      up.addEventListener('click', () => {
        guess[i] = (guess[i] + 1) % RANGE;
        val.textContent = String(guess[i]);
      });
      down.addEventListener('click', () => {
        guess[i] = (guess[i] + RANGE - 1) % RANGE;
        val.textContent = String(guess[i]);
      });
      col.appendChild(up);
      col.appendChild(val);
      col.appendChild(down);
      guessRow.appendChild(col);
      digitEls.push(val);
    }
    wrap.appendChild(guessRow);
    wrap.appendChild(legendEl());

    const submitBtn = document.createElement('button');
    submitBtn.textContent = `Submit guess (${triesLeft} left)`;
    submitBtn.style.cssText = 'padding:0.6rem 1.2rem;border-radius:0.5rem;border:none;background:#ef5468;color:#1a0508;font-weight:700;font-family:inherit;cursor:pointer;';
    wrap.appendChild(submitBtn);

    const history = document.createElement('div');
    history.style.cssText = 'display:flex;flex-direction:column;gap:5px;width:100%;max-height:7.5rem;overflow-y:auto;';
    wrap.appendChild(history);

    submitBtn.addEventListener('click', () => {
      if (done) return;
      let exact = 0;
      let present = 0;
      const codeCopy = [...code];
      const guessCopy = [...guess];
      for (let i = 0; i < N; i++) {
        if (guessCopy[i] === codeCopy[i]) {
          exact++;
          codeCopy[i] = guessCopy[i] = -1;
        }
      }
      for (let i = 0; i < N; i++) {
        if (guessCopy[i] === -1) continue;
        const j = codeCopy.indexOf(guessCopy[i]);
        if (j !== -1) {
          present++;
          codeCopy[j] = -1;
        }
      }
      bestCorrect = Math.max(bestCorrect, exact);
      const row = document.createElement('div');
      row.style.cssText = 'font-family:monospace;font-size:0.75rem;color:#8b90a4;display:flex;gap:6px;align-items:center;';
      row.textContent = guess.join(' ') + '  →  ';
      const dots = document.createElement('span');
      dots.innerHTML = '🟢'.repeat(exact) + '🟡'.repeat(present);
      row.appendChild(dots);
      history.prepend(row);
      if (exact === N) {
        finish(true);
        return;
      }
      triesLeft--;
      submitBtn.textContent = `Submit guess (${triesLeft} left)`;
      if (triesLeft <= 0) finish(false);
    });

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
      if (raf) cancelAnimationFrame(raf);
      stage.removeChild(wrap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}

// Idle preview - cycles through random guesses against a random code and
// shows the hot/cold feedback, no input, no scoring. Ported verbatim from
// the deck's own preview().
export function MiniGameCodeBreakerPreview() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const N = 4;
    const RANGE = 6;
    const code = Array.from({ length: N }, () => Math.floor(Math.random() * RANGE));
    let guess = new Array(N).fill(0);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;gap:0.8rem;align-items:center;justify-content:center;box-sizing:border-box;padding:16px;';
    stage.appendChild(wrap);
    const guessRow = document.createElement('div');
    guessRow.style.cssText = 'display:flex;gap:8px;';
    const digitEls: HTMLDivElement[] = [];
    for (let i = 0; i < N; i++) {
      const val = document.createElement('div');
      val.textContent = '0';
      val.style.cssText = 'width:2.4rem;height:2.4rem;display:flex;align-items:center;justify-content:center;border-radius:0.4rem;background:#22262f;border:2px solid #3a4054;font-family:monospace;font-weight:700;font-size:1.2rem;';
      guessRow.appendChild(val);
      digitEls.push(val);
    }
    wrap.appendChild(guessRow);
    wrap.appendChild(legendEl());
    const history = document.createElement('div');
    history.style.cssText = 'display:flex;flex-direction:column;gap:5px;width:100%;';
    wrap.appendChild(history);
    let cancelled = false;
    let timer = 0;
    function randomGuess() {
      return Array.from({ length: N }, () => Math.floor(Math.random() * RANGE));
    }
    function submit() {
      if (cancelled) return;
      let exact = 0;
      let present = 0;
      const codeCopy = [...code];
      const guessCopy = [...guess];
      for (let i = 0; i < N; i++) {
        if (guessCopy[i] === codeCopy[i]) {
          exact++;
          codeCopy[i] = guessCopy[i] = -1;
        }
      }
      for (let i = 0; i < N; i++) {
        if (guessCopy[i] === -1) continue;
        const j = codeCopy.indexOf(guessCopy[i]);
        if (j !== -1) {
          present++;
          codeCopy[j] = -1;
        }
      }
      const row = document.createElement('div');
      row.style.cssText = 'font-family:monospace;font-size:0.75rem;color:#8b90a4;display:flex;gap:6px;align-items:center;';
      row.textContent = guess.join(' ') + '  →  ';
      const dots = document.createElement('span');
      dots.innerHTML = '🟢'.repeat(exact) + '🟡'.repeat(present);
      row.appendChild(dots);
      history.prepend(row);
      while (history.children.length > 3) history.removeChild(history.lastChild!);
      if (exact === N || history.children.length >= 3) {
        timer = window.setTimeout(() => {
          if (cancelled) return;
          history.innerHTML = '';
          guess = randomGuess();
          digitEls.forEach((d, i) => (d.textContent = String(guess[i])));
          timer = window.setTimeout(cycleDigits, 260);
        }, 900);
      } else {
        timer = window.setTimeout(() => {
          if (cancelled) return;
          guess = randomGuess();
          digitEls.forEach((d, i) => (d.textContent = String(guess[i])));
          timer = window.setTimeout(submit, 700);
        }, 500);
      }
    }
    function cycleDigits() {
      if (cancelled) return;
      guess = randomGuess();
      digitEls.forEach((d, i) => (d.textContent = String(guess[i])));
      timer = window.setTimeout(submit, 700);
    }
    timer = window.setTimeout(cycleDigits, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stage.removeChild(wrap);
    };
  }, []);

  return <div ref={stageRef} style={{ position: 'relative', width: '100%', height: 420, background: '#0c0e14', borderRadius: '0.75rem', overflow: 'hidden' }} />;
}
