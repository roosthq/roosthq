import { useState } from 'react';

// Spelling break, concept "Word Grid Snap" (Recess Concepts deck). A
// small fixed letter grid; tap letters in any order to spell the target
// word - every letter is its own big, separated tile, the opposite of
// overlapping balloons.
const WORDS = ['CAT', 'DOG', 'SUN', 'FISH', 'STAR', 'TREE'];
const DECOY_POOL = 'EIOQVXZKMP'.split('');

export default function WordGridSnap({ grade, onDone }: { grade: number; onDone: () => void }) {
  const [word] = useState(() => {
    const pool = grade <= 2 ? WORDS.filter((w) => w.length <= 3) : WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
  });
  const [cells] = useState(() => {
    // One tile PER OCCURRENCE, not deduped - "TREE" needs two separate E
    // tiles, since a tile is consumed the moment it's tapped.
    const need = word.split('');
    const decoyCount = Math.max(0, 9 - need.length);
    const decoys = [...DECOY_POOL].sort(() => Math.random() - 0.5).slice(0, decoyCount);
    return [...need, ...decoys].map((letter, i) => ({ id: i, letter })).sort(() => Math.random() - 0.5);
  });
  const [filled, setFilled] = useState<string[]>([]);
  const [usedCellIds, setUsedCellIds] = useState<Set<number>>(new Set());
  const [wrongId, setWrongId] = useState<number | null>(null);
  const done = filled.length === word.length;

  function tap(id: number, letter: string) {
    if (usedCellIds.has(id) || done) return;
    const needed = word[filled.length];
    if (letter === needed) {
      setUsedCellIds((s) => new Set(s).add(id));
      const next = [...filled, letter];
      setFilled(next);
      if (next.length === word.length) setTimeout(onDone, 700);
    } else {
      setWrongId(id);
      setTimeout(() => setWrongId(null), 200);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '🔤 Spelled it!' : `Quick break! Spell: ${word}`}</p>
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <button
            key={c.id}
            onClick={() => tap(c.id, c.letter)}
            disabled={usedCellIds.has(c.id)}
            className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 text-lg font-bold ${
              usedCellIds.has(c.id)
                ? 'invisible'
                : wrongId === c.id
                  ? 'animate-pulse border-red-300 text-slate-700'
                  : 'border-rose-300 bg-white text-rose-600 hover:bg-rose-50'
            }`}
          >
            {c.letter}
          </button>
        ))}
      </div>
    </div>
  );
}
