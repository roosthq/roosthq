import { useEffect, useRef, useState, type ReactElement } from 'react';

// Reading's arcade break (PLANNING.md §19) - "Grow Rush". One growth-stage
// icon falls at a time; tap it ONLY if it's the correct next stage in
// order, ignore decoys. Real timing pressure (each falls over ~3.2s, miss
// it and it respawns) - same reflex-game DNA as MiniGameBugZapper.tsx, not
// a static tap-in-order puzzle (that version got real, deserved pushback:
// no motion, no timing, "not really a game"). Real hand-drawn SVG icons.
type StageId = 'seed' | 'sprout' | 'stem' | 'flower';
const ORDER: StageId[] = ['seed', 'sprout', 'stem', 'flower'];
const FALL_MS = 3200;

function SeedIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <ellipse cx="20" cy="26" rx="7" ry="9" fill="#8b5e34" />
      <ellipse cx="17" cy="22" rx="2.4" ry="3" fill="#a97a4c" opacity="0.6" />
      <path d="M12 34c8-2 16-2 24 0" stroke="#8b5e34" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function SproutIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M12 34c8-2 16-2 24 0" stroke="#8b5e34" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 34V22" stroke="#4a8f3c" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M20 24c-4-2-6-6-4-9 4 1 6 5 4 9z" fill="#5fa84a" />
      <path d="M20 22c4-2 6-5 4-8-4 1-6 4-4 8z" fill="#5fa84a" />
    </svg>
  );
}
function StemIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M12 34c8-2 16-2 24 0" stroke="#8b5e34" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 34V10" stroke="#4a8f3c" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M20 26c-6-2-9-7-6-12 6 1 9 6 6 12z" fill="#5fa84a" />
      <path d="M20 20c6-2 9-6 6-11-6 1-9 5-6 11z" fill="#5fa84a" />
    </svg>
  );
}
function FlowerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M12 34c8-2 16-2 24 0" stroke="#8b5e34" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 34V16" stroke="#4a8f3c" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M20 24c-5-2-7-6-5-10 5 1 7 5 5 10z" fill="#5fa84a" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="20" cy="9" rx="3.4" ry="6" fill="#f2a6c9" transform={`rotate(${deg} 20 14)`} />
      ))}
      <circle cx="20" cy="14" r="3.2" fill="#f2c14e" />
    </svg>
  );
}
const ICONS: Record<StageId, (p: { size: number }) => ReactElement> = { seed: SeedIcon, sprout: SproutIcon, stem: StemIcon, flower: FlowerIcon };

function randomStage(exclude?: StageId): StageId {
  const pool = ORDER.filter((s) => s !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}
function spawnStage(nextNeeded: StageId): StageId {
  return Math.random() < 0.55 ? nextNeeded : randomStage(nextNeeded);
}

export default function StoryBuilder({ onDone }: { onDone: () => void }) {
  const [placedCount, setPlacedCount] = useState(0);
  const [item, setItem] = useState<{ id: number; stage: StageId; x: number } | null>(null);
  const [fallPct, setFallPct] = useState(0);
  const [shake, setShake] = useState(false);
  const [finished, setFinished] = useState(false);
  const idRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const placedRef = useRef(0);

  useEffect(() => {
    if (finished) return;
    function spawn() {
      idRef.current += 1;
      startRef.current = null;
      setItem({ id: idRef.current, stage: spawnStage(ORDER[placedRef.current] ?? ORDER[0]), x: 12 + Math.random() * 70 });
      setFallPct(0);
    }
    spawn();
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const pct = Math.min(100, ((ts - startRef.current) / FALL_MS) * 100);
      setFallPct(pct);
      if (pct >= 100) {
        spawn();
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function tap() {
    if (!item || finished) return;
    const needed = ORDER[placedRef.current];
    if (item.stage === needed) {
      const next = placedRef.current + 1;
      placedRef.current = next;
      setPlacedCount(next);
      if (next >= ORDER.length) {
        setFinished(true);
        cancelAnimationFrame(rafRef.current);
        setTimeout(onDone, 700);
        return;
      }
      idRef.current += 1;
      startRef.current = null;
      setItem({ id: idRef.current, stage: spawnStage(ORDER[next]), x: 12 + Math.random() * 70 });
      setFallPct(0);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 200);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {finished ? '🌼 Grew into a flower!' : 'Quick break! Tap only the NEXT growth stage as it falls 🌱'}
      </p>

      <div className="flex items-center justify-center gap-2">
        {ORDER.map((stage, i) => {
          const Icon = ICONS[stage];
          const filled = i < placedCount;
          return (
            <div
              key={stage}
              className={`flex h-14 w-14 items-center justify-center rounded-lg border-2 ${filled ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-300 bg-slate-50'}`}
            >
              {filled && <Icon size={34} />}
            </div>
          );
        })}
      </div>

      <div className="relative h-48 w-full overflow-hidden rounded-lg bg-sky-50">
        {item && !finished && (
          <button
            onClick={tap}
            className={`absolute -translate-x-1/2 transition-none ${shake ? 'animate-pulse' : ''}`}
            style={{ left: `${item.x}%`, top: `${fallPct * 0.85}%` }}
          >
            {(() => {
              const Icon = ICONS[item.stage];
              return <Icon size={44} />;
            })()}
          </button>
        )}
        <div className="absolute bottom-0 h-2 w-full bg-emerald-200" />
      </div>
    </div>
  );
}
