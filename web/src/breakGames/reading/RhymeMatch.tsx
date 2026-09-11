import { useState } from 'react';

// Reading break, concept "Rhyme Match" (Recess Concepts deck). Standard
// memory-match grid - tiles never move once the round starts. Rhymes get
// subtler as grade goes up; the mechanic never changes.
const POOLS: string[][][] = [
  [['cat', 'hat'], ['dog', 'log'], ['sun', 'fun'], ['red', 'bed'], ['pig', 'wig']],
  [['light', 'night'], ['plant', 'ant'], ['cake', 'lake'], ['star', 'car'], ['tree', 'bee']],
  [['nation', 'station'], ['motion', 'ocean'], ['thunder', 'wonder'], ['pillow', 'willow'], ['decide', 'collide']],
];
const PAIR_COUNT = 3;

interface Tile {
  id: number;
  word: string;
  pairId: number;
}

export default function RhymeMatch({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 1 ? 0 : grade <= 3 ? 1 : 2;
  const [tiles] = useState<Tile[]>(() => {
    const pool = [...POOLS[tier]].sort(() => Math.random() - 0.5).slice(0, PAIR_COUNT);
    const flat: Tile[] = [];
    pool.forEach((pair, pairId) => {
      pair.forEach((word) => flat.push({ id: flat.length, word, pairId }));
    });
    return flat.sort(() => Math.random() - 0.5);
  });
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [locked, setLocked] = useState(false);

  const done = matched.size === tiles.length;

  function tap(id: number) {
    if (locked || matched.has(id) || open.includes(id) || done) return;
    const nextOpen = [...open, id];
    setOpen(nextOpen);
    if (nextOpen.length === 2) {
      setLocked(true);
      const [a, b] = nextOpen;
      const tileA = tiles.find((t) => t.id === a)!;
      const tileB = tiles.find((t) => t.id === b)!;
      if (tileA.pairId === tileB.pairId) {
        const nextMatched = new Set(matched);
        nextMatched.add(a);
        nextMatched.add(b);
        setTimeout(() => {
          setMatched(nextMatched);
          setOpen([]);
          setLocked(false);
          if (nextMatched.size === tiles.length) setTimeout(onDone, 500);
        }, 400);
      } else {
        setTimeout(() => {
          setOpen([]);
          setLocked(false);
        }, 700);
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '🎵 All matched!' : 'Quick break! Flip two tiles that rhyme'}</p>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => {
          const isOpen = open.includes(t.id) || matched.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => tap(t.id)}
              disabled={matched.has(t.id)}
              className={`flex h-16 w-24 items-center justify-center rounded-lg border-2 text-sm font-semibold ${
                matched.has(t.id)
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : isOpen
                    ? 'border-amber-400 bg-amber-50 text-slate-700'
                    : 'border-slate-300 bg-slate-700 text-slate-700'
              }`}
            >
              {isOpen ? t.word : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
