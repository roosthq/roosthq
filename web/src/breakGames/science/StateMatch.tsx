import { useState } from 'react';

// Science break, concept "State Match" (Recess Concepts deck). Same
// proven memory-match grid as Rhyme Match, reused rather than
// reinvented - one rule, two subjects.
const POOLS: string[][][] = [
  [['Solid', 'Ice cube'], ['Liquid', 'Water'], ['Gas', 'Steam']],
  [['Solid', 'Rock'], ['Liquid', 'Juice'], ['Gas', 'Air we breathe']],
  [['Solid', 'Glacier'], ['Liquid', 'Melted wax'], ['Gas', 'Carbon dioxide']],
];

interface Tile {
  id: number;
  label: string;
  pairId: number;
}

export default function StateMatch({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 1 ? 0 : grade <= 3 ? 1 : 2;
  const [tiles] = useState<Tile[]>(() => {
    const flat: Tile[] = [];
    POOLS[tier].forEach((pair, pairId) => pair.forEach((label) => flat.push({ id: flat.length, label, pairId })));
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
      <p className="text-sm font-semibold text-slate-600">{done ? '🧪 All matched!' : 'Quick break! Flip two tiles that go together'}</p>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => {
          const isOpen = open.includes(t.id) || matched.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => tap(t.id)}
              disabled={matched.has(t.id)}
              className={`flex h-16 w-24 items-center justify-center rounded-lg border-2 px-1 text-center text-xs font-semibold ${
                matched.has(t.id)
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : isOpen
                    ? 'border-amber-400 bg-amber-50 text-slate-700'
                    : 'border-slate-300 bg-slate-700 text-slate-700'
              }`}
            >
              {isOpen ? t.label : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
