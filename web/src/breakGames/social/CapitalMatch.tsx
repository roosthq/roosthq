import { useState } from 'react';
import { useDragOrTapAsymmetric, modeForGrade } from '../dragOrTap';

// Social Studies break, concept "Capital Match". Fixed row of state tiles,
// fixed row of capital-city targets, nothing falls or times out - same
// asymmetric drag/tap engine as science's Habitat Sort. Grade 2+: real
// drag. K-1: tap the state, then tap its capital. Pairs are real US
// state/capital facts, grouped easiest-first so a young kid isn't matching
// a state they've never heard of.
interface Pair {
  state: string;
  capital: string;
}
const TIERS: Pair[][] = [
  [
    { state: 'Texas', capital: 'Austin' },
    { state: 'Ohio', capital: 'Columbus' },
    { state: 'Georgia', capital: 'Atlanta' },
  ],
  [
    { state: 'California', capital: 'Sacramento' },
    { state: 'Florida', capital: 'Tallahassee' },
    { state: 'Colorado', capital: 'Denver' },
    { state: 'Arizona', capital: 'Phoenix' },
  ],
  [
    { state: 'New York', capital: 'Albany' },
    { state: 'Illinois', capital: 'Springfield' },
    { state: 'Pennsylvania', capital: 'Harrisburg' },
    { state: 'Washington', capital: 'Olympia' },
    { state: 'Massachusetts', capital: 'Boston' },
  ],
];
function tierForGrade(grade: number) {
  return grade <= 1 ? 0 : grade <= 4 ? 1 : 2;
}

export default function CapitalMatch({ grade, onDone }: { grade: number; onDone: () => void }) {
  const mode = modeForGrade(grade);
  const [pairs] = useState<Pair[]>(() => TIERS[tierForGrade(grade)]);
  const [stateOrder] = useState(() => [...pairs.keys()].sort(() => Math.random() - 0.5));
  const [capitalOrder] = useState(() => [...pairs.keys()].sort(() => Math.random() - 0.5));
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<number | null>(null);

  const { itemProps, targetProps, dragging, selected } = useDragOrTapAsymmetric({
    mode,
    onCommit: (stateIdxStr, capitalIdxStr) => {
      const si = Number(stateIdxStr);
      const ci = Number(capitalIdxStr);
      if (placed.has(si)) return;
      if (si === ci) {
        const next = new Set(placed);
        next.add(si);
        setPlaced(next);
        if (next.size === pairs.length) setTimeout(onDone, 700);
      } else {
        setWrongFlash(ci);
        setTimeout(() => setWrongFlash(null), 250);
      }
    },
  });

  const done = placed.size === pairs.length;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {done ? '🗺️ Every state found its capital!' : mode === 'drag' ? 'Quick break! Drag each state to its capital city 🏛️' : 'Quick break! Tap a state, then tap its capital city 🏛️'}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        {stateOrder.map((si) => {
          if (placed.has(si)) return <div key={si} className="h-11 w-24" />;
          const props = itemProps(String(si));
          const isSelected = selected === String(si);
          const isDragging = dragging?.id === String(si);
          return (
            <button
              key={si}
              {...props}
              style={{ touchAction: 'none', ...(isSelected ? {} : { borderColor: 'var(--border)' }) }}
              className={`rounded-lg border-2 bg-white px-3 py-2 text-sm font-semibold text-slate-700 ${
                isSelected ? 'border-amber-400' : ''
              } ${isDragging ? 'opacity-30' : ''}`}
            >
              {pairs[si].state}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {capitalOrder.map((ci) => {
          const props = targetProps(String(ci));
          const alreadyMatched = placed.has(ci);
          return (
            <button
              key={ci}
              {...props}
              style={{ touchAction: 'none', borderColor: alreadyMatched ? undefined : 'var(--border)' }}
              className={`flex flex-col items-center gap-0.5 rounded-lg border-2 px-3 py-2 text-sm ${
                alreadyMatched ? 'border-emerald-400 bg-slate-100 text-emerald-700' : props['data-hover'] ? 'border-amber-400' : 'bg-white text-slate-600'
              } ${wrongFlash === ci ? 'animate-pulse' : ''}`}
            >
              {pairs[ci].capital} {alreadyMatched ? '✓' : ''}
            </button>
          );
        })}
      </div>

      {mode === 'drag' && dragging && (
        <div
          style={{ position: 'fixed', left: dragging.x, top: dragging.y, transform: 'translate(-50%,-50%) scale(1.15)', pointerEvents: 'none', zIndex: 50 }}
          className="rounded-lg border-2 border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          {pairs[Number(dragging.id)].state}
        </div>
      )}
    </div>
  );
}
