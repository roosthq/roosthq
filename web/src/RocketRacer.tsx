import { useEffect, useRef, useState } from 'react';

// Arcade break for Learning Games (PLANNING.md §19) - the simplest of the
// new subject-specific games, chosen first on purpose to prove the
// question-round <-> arcade-break handoff end to end. No stakes, no tokens,
// no subject content here - purely a pacing beat between block A and block
// B. Later math-specific version (answering a problem = a boost) is a
// follow-up, not this file's job.
const DURATION_MS = 12000;
const GHOST_FINISH_PCT = 94;
const ROCKET_FINISH_PCT = 96;
const BOOST_SPEED = 0.85; // % per tick added on tap
const DECAY_PER_TICK = 0.018; // speed bleeds off each frame - tapping once and
// walking away doesn't win the race, has to keep tapping

export default function RocketRacer({ onDone }: { onDone: () => void }) {
  const [rocketPct, setRocketPct] = useState(4);
  const [ghostPct, setGhostPct] = useState(4);
  const [finished, setFinished] = useState(false);
  const speedRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const rocketPctRef = useRef(4);

  useEffect(() => {
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / DURATION_MS);
      setGhostPct(4 + t * (GHOST_FINISH_PCT - 4));
      speedRef.current = Math.max(0, speedRef.current - DECAY_PER_TICK);
      rocketPctRef.current = Math.min(ROCKET_FINISH_PCT, rocketPctRef.current + speedRef.current);
      setRocketPct(rocketPctRef.current);
      if (elapsed < DURATION_MS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setFinished(true);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  function boost() {
    speedRef.current = Math.min(2.4, speedRef.current + BOOST_SPEED);
  }

  const won = rocketPct >= ghostPct;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {finished ? (won ? '🏁 You beat the ghost car!' : '🏁 Ghost car got there first - nice race!') : 'Quick break! Tap BOOST to race ahead 🚀'}
      </p>
      <div className="relative h-16 w-full overflow-hidden rounded-lg bg-slate-100" style={{ touchAction: 'none' }}>
        <div className="absolute top-9 h-0.5 w-full bg-slate-300" />
        <div className="absolute top-1 text-3xl transition-[left] duration-75" style={{ left: `${ghostPct}%` }}>
          👻🏎️
        </div>
        <div className="absolute bottom-1 text-3xl transition-[left] duration-75" style={{ left: `${rocketPct}%` }}>
          🚀
        </div>
        <div className="absolute right-1 top-0 h-full w-1 bg-slate-300" />
      </div>
      {!finished ? (
        <button
          onClick={boost}
          className="w-full rounded-lg bg-amber-500 py-4 text-lg font-bold text-white active:scale-95 active:bg-amber-600"
          style={{ touchAction: 'manipulation' }}
        >
          💥 BOOST
        </button>
      ) : (
        <button onClick={onDone} className="rounded-lg bg-slate-800 px-6 py-2 font-semibold text-white hover:bg-slate-700">
          Continue →
        </button>
      )}
    </div>
  );
}
