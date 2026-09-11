import { useState, type ReactElement } from 'react';

// Science break, concept "Life Cycle Ring" (Recess Concepts deck). 4
// stages sit fixed around a circle, one marked "start." Tap them in
// clockwise order. Butterfly life cycle - a real, standard elementary
// science sequence. Floor is grade 2+ (reading a circular sequence is
// trickier than a line for K-1 - see the deck's own grade badge).
type StageId = 0 | 1 | 2 | 3;
const LABELS = ['Egg', 'Caterpillar', 'Cocoon', 'Butterfly'];
// Positions around the ring, clockwise starting at the top.
const ANGLES = [-90, 0, 90, 180];

function EggIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <ellipse cx="20" cy="22" rx="10" ry="13" fill="#f4ecd8" stroke="#c9b98a" strokeWidth="1.5" />
    </svg>
  );
}
function CaterpillarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      {[10, 17, 24, 31].map((cx, i) => (
        <circle key={i} cx={cx} cy={22 + (i % 2)} r="6" fill="#5fa84a" />
      ))}
      <circle cx="10" cy="21" r="1.2" fill="#1c2b1c" />
    </svg>
  );
}
function CocoonIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <line x1="20" y1="4" x2="20" y2="12" stroke="#8b90a4" strokeWidth="1.5" />
      <ellipse cx="20" cy="24" rx="8" ry="14" fill="#c9975a" />
      <line x1="14" y1="16" x2="26" y2="16" stroke="#a1723d" strokeWidth="1" />
      <line x1="13" y1="24" x2="27" y2="24" stroke="#a1723d" strokeWidth="1" />
      <line x1="14" y1="32" x2="26" y2="32" stroke="#a1723d" strokeWidth="1" />
    </svg>
  );
}
function ButterflyIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <line x1="20" y1="10" x2="20" y2="32" stroke="#3a3448" strokeWidth="2" />
      <path d="M20 14c-4-8-16-6-14 2 2 6 10 4 14-2z" fill="#e5484d" />
      <path d="M20 14c4-8 16-6 14 2-2 6-10 4-14-2z" fill="#e5484d" />
      <path d="M20 20c-3-5-12-4-10 2 1 4 7 3 10-2z" fill="#f2a6c9" />
      <path d="M20 20c3-5 12-4 10 2-1 4-7 3-10-2z" fill="#f2a6c9" />
    </svg>
  );
}
const ICONS: Record<StageId, (p: { size: number }) => ReactElement> = { 0: EggIcon, 1: CaterpillarIcon, 2: CocoonIcon, 3: ButterflyIcon };

export default function LifeCycleRing({ onDone }: { grade: number; onDone: () => void }) {
  const [nextIdx, setNextIdx] = useState(0);
  const [wrong, setWrong] = useState<StageId | null>(null);
  const done = nextIdx > 3;

  function tap(stage: StageId) {
    if (done) return;
    if (stage === nextIdx) {
      const next = nextIdx + 1;
      setNextIdx(next);
      if (next > 3) setTimeout(onDone, 700);
    } else {
      setWrong(stage);
      setTimeout(() => setWrong(null), 200);
    }
  }

  const R = 70;
  const center = 100;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '🦋 Full life cycle!' : 'Quick break! Tap the stages in order, starting at the egg'}</p>
      <svg viewBox="0 0 200 200" width="240" height="240">
        <circle cx={center} cy={center} r={R} fill="none" stroke="#e2e8f0" strokeWidth="2" />
        {ANGLES.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const cx = center + R * Math.cos(rad);
          const cy = center + R * Math.sin(rad);
          const stage = i as StageId;
          const isDone = stage < nextIdx;
          const isNext = stage === nextIdx;
          const Icon = ICONS[stage];
          return (
            <g key={i} transform={`translate(${cx - 24} ${cy - 24})`}>
              <foreignObject x="0" y="0" width="48" height="48">
                <button
                  onClick={() => tap(stage)}
                  style={{ width: 48, height: 48 }}
                  className={`flex items-center justify-center rounded-full border-2 bg-white ${
                    isDone ? 'border-emerald-400 bg-emerald-50' : isNext ? 'border-amber-400' : 'border-slate-200'
                  } ${wrong === stage ? 'animate-pulse border-red-300' : ''}`}
                >
                  <Icon size={34} />
                </button>
              </foreignObject>
              <text x="24" y="60" textAnchor="middle" fontSize="10" fontFamily="system-ui" fill="#64748b">
                {LABELS[stage]}
              </text>
            </g>
          );
        })}
        <text x={center} y={center + 4} textAnchor="middle" fontSize="10" fontFamily="system-ui" fill="#94a3b8">
          start &rarr;
        </text>
      </svg>
    </div>
  );
}
