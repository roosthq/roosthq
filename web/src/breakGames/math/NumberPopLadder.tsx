import { useState } from 'react';

// Math break, concept "Number Pop Ladder" (Recess Concepts deck). Numbers
// sit in a fixed grid (never free-floating x/y - that's exactly how the old
// BalloonLetters ended up with tiles stacked on each other) with their
// VISUAL ORDER shuffled across grid cells, so the numbers look scattered
// while every cell stays evenly spaced and independently clickable. Grade
// 2+ skip-counts instead of counting by 1s, so this doesn't go trivial by
// upper grades.
const COLS = 4;

function buildSequence(grade: number): number[] {
  if (grade <= 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const step = grade === 2 ? 2 : grade === 3 ? 5 : grade === 4 ? 3 : grade === 5 ? 7 : 9;
  const start = 1 + Math.floor(Math.random() * step);
  return Array.from({ length: 8 }, (_, i) => start + i * step);
}

export default function NumberPopLadder({ grade, onDone }: { grade: number; onDone: () => void }) {
  const [sequence] = useState(() => buildSequence(grade));
  const [cellOrder] = useState(() => [...sequence.keys()].sort(() => Math.random() - 0.5));
  const [nextIdx, setNextIdx] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const done = nextIdx >= sequence.length;

  function tap(seqIndex: number) {
    if (done) return;
    if (seqIndex === nextIdx) {
      const next = nextIdx + 1;
      setNextIdx(next);
      if (next >= sequence.length) setTimeout(onDone, 700);
    } else if (seqIndex > nextIdx) {
      setWrong(seqIndex);
      setTimeout(() => setWrong(null), 200);
    }
  }

  const rows = Math.ceil(sequence.length / COLS);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {done ? '🔢 Nice counting!' : `Quick break! Tap in order: ${sequence.slice(0, 3).join(', ')}...`}
      </p>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))` }}>
        {cellOrder.map((seqIndex) => {
          const popped = seqIndex < nextIdx;
          return (
            <button
              key={seqIndex}
              onClick={() => tap(seqIndex)}
              disabled={popped}
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold ${
                popped ? 'border-amber-400 bg-amber-400 text-white' : wrong === seqIndex ? 'animate-pulse border-red-300 text-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {popped ? '✓' : sequence[seqIndex]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
