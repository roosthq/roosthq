import { useEffect, useRef, useState } from 'react';

// Spelling's arcade break (PLANNING.md §19) - "Balloon Pop Climb". Several
// letter balloons rise continuously at once (decoys mixed in); tap the
// correct NEXT letter before it floats off the top, or it loops back to
// the bottom and rises again (no-stakes, no fail). Real continuous motion
// and real-time tracking of multiple targets - the static grid-of-buttons
// version had none of that, fair pushback that it wasn't really a game.
const WORDS = ['CAT', 'SUN', 'DOG', 'RUN', 'BIG', 'HAT'];
const DECOY_POOL = 'EIOQVXZ'.split('');
const COLORS = ['#e5484d', '#5b8def', '#f2c14e', '#5fa84a', '#c27ba0'];
const RISE_MS = 4600;

interface Balloon {
  id: number;
  letter: string;
  x: number;
  startTime: number | null;
}

function BalloonSvg({ letter, color, size = 52 }: { letter: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46">
      <path d="M20 2C11 2 5 10 5 18s6 16 15 16 15-8 15-16S29 2 20 2z" fill={color} />
      <ellipse cx="15" cy="12" rx="2.4" ry="3.6" fill="#fff" opacity="0.25" />
      <path d="M20 34l-2 3 2 2 2-2z" fill={color} />
      <text x="20" y="22" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="system-ui">
        {letter}
      </text>
    </svg>
  );
}

export default function BalloonLetters({ onDone }: { onDone: () => void }) {
  const [word] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [filled, setFilled] = useState<string[]>([]);
  const [balloons, setBalloons] = useState<Balloon[]>(() => {
    const decoys = [...DECOY_POOL].sort(() => Math.random() - 0.5).slice(0, 2);
    return [...word.split(''), ...decoys].map((letter, i) => ({ id: i, letter, x: 10 + Math.random() * 78, startTime: null }));
  });
  const [poppedIds, setPoppedIds] = useState<Set<number>>(new Set());
  const [wrongId, setWrongId] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [risePct, setRisePct] = useState<Record<number, number>>({});
  const filledRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (finished) return;
    function tick(ts: number) {
      setBalloons((current) => {
        let changed = false;
        const next = current.map((b) => {
          if (poppedIds.has(b.id)) return b;
          if (b.startTime === null) {
            changed = true;
            return { ...b, startTime: ts };
          }
          return b;
        });
        return changed ? next : current;
      });
      setRisePct((prevPct) => {
        const nextPct: Record<number, number> = { ...prevPct };
        for (const b of balloons) {
          if (poppedIds.has(b.id) || b.startTime === null) continue;
          const pct = ((ts - b.startTime) % RISE_MS) / RISE_MS;
          nextPct[b.id] = pct;
        }
        return nextPct;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, balloons, poppedIds]);

  function tap(b: Balloon) {
    if (poppedIds.has(b.id) || finished) return;
    const needed = word[filledRef.current];
    if (b.letter === needed) {
      setPoppedIds((p) => new Set(p).add(b.id));
      const next = filledRef.current + 1;
      filledRef.current = next;
      setFilled((f) => [...f, b.letter]);
      if (next >= word.length) {
        setFinished(true);
        cancelAnimationFrame(rafRef.current);
        setTimeout(onDone, 700);
      }
    } else {
      setWrongId(b.id);
      setTimeout(() => setWrongId(null), 200);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{finished ? '🎈 Spelled it!' : 'Quick break! Pop the letters in order before they float away 🎈'}</p>

      <div className="flex gap-2">
        {word.split('').map((_letter, i) => (
          <div
            key={i}
            className={`flex h-10 w-10 items-center justify-center rounded border-2 text-lg font-bold ${
              filled[i] ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-dashed border-slate-300 text-slate-300'
            }`}
          >
            {filled[i] ?? '_'}
          </div>
        ))}
      </div>

      <div className="relative h-56 w-full overflow-hidden rounded-lg bg-sky-50">
        {balloons
          .filter((b) => !poppedIds.has(b.id))
          .map((b) => {
            const pct = risePct[b.id] ?? 0;
            const top = 100 - pct * 105; // rises from bottom (100%) past the top (-5%)
            return (
              <button
                key={b.id}
                onClick={() => tap(b)}
                className={`absolute -translate-x-1/2 ${wrongId === b.id ? 'animate-pulse' : ''}`}
                style={{ left: `${b.x}%`, top: `${top}%` }}
              >
                <BalloonSvg letter={b.letter} color={COLORS[b.id % COLORS.length]} />
              </button>
            );
          })}
      </div>
    </div>
  );
}
