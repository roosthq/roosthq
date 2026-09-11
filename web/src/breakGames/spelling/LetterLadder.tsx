import { useState } from 'react';

// Spelling break, concept "Letter Ladder" (Recess Concepts deck). Word
// blanks up top; a fixed row of letters below with real gaps between them
// - this is the balloon idea done right, same goal, no motion to time and
// no letter ever sits behind another.
const WORDS = ['CAT', 'SUN', 'DOG', 'RUN', 'BIG', 'HAT', 'FISH', 'STAR', 'TREE'];
const DECOY_POOL = 'EIOQVXZ'.split('');

export default function LetterLadder({ grade, onDone }: { grade: number; onDone: () => void }) {
  const [word] = useState(() => {
    const pool = grade <= 2 ? WORDS.filter((w) => w.length <= 3) : WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
  });
  const [letters] = useState(() => {
    const decoys = [...DECOY_POOL].sort(() => Math.random() - 0.5).slice(0, 2);
    return [...word.split(''), ...decoys].map((letter, i) => ({ id: i, letter })).sort(() => Math.random() - 0.5);
  });
  const [filled, setFilled] = useState<string[]>([]);
  const [popped, setPopped] = useState<Set<number>>(new Set());
  const [wrongId, setWrongId] = useState<number | null>(null);
  const done = filled.length === word.length;

  function tap(id: number, letter: string) {
    if (popped.has(id) || done) return;
    const needed = word[filled.length];
    if (letter === needed) {
      setPopped((p) => new Set(p).add(id));
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
      <p className="text-sm font-semibold text-slate-600">{done ? '🪜 Spelled it!' : 'Quick break! Tap the letters in order to spell the word'}</p>
      <div className="flex gap-2">
        {word.split('').map((_l, i) => (
          <div
            key={i}
            className={`flex h-11 w-11 items-center justify-center rounded border-2 text-lg font-bold ${
              filled[i] ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-dashed border-slate-300 text-slate-300'
            }`}
          >
            {filled[i] ?? '_'}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {letters.map((l) => (
          <button
            key={l.id}
            onClick={() => tap(l.id, l.letter)}
            disabled={popped.has(l.id)}
            className={`flex h-14 w-14 items-center justify-center rounded-lg border-2 text-xl font-bold ${
              popped.has(l.id)
                ? 'invisible'
                : wrongId === l.id
                  ? 'animate-pulse border-red-300 text-slate-700'
                  : 'border-rose-300 bg-white text-rose-600 hover:bg-rose-50'
            }`}
          >
            {l.letter}
          </button>
        ))}
      </div>
    </div>
  );
}
