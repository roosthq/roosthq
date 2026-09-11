import { useState } from 'react';

// Spelling break, concept "Rhyme Pop" (Recess Concepts deck). Same
// word-plus-options shape as Rhyme Match/Word Meaning Bubbles, reused
// again rather than reinvented.
interface Round {
  word: string;
  answer: string;
  decoys: string[];
}
const POOLS: Round[][] = [
  [
    { word: 'CAT', answer: 'HAT', decoys: ['DOG', 'SUN'] },
    { word: 'DOG', answer: 'LOG', decoys: ['CAT', 'FISH'] },
    { word: 'SUN', answer: 'FUN', decoys: ['STAR', 'TREE'] },
  ],
  [
    { word: 'LIGHT', answer: 'NIGHT', decoys: ['PLANT', 'CAKE'] },
    { word: 'PLANT', answer: 'ANT', decoys: ['STAR', 'TREE'] },
    { word: 'CAKE', answer: 'LAKE', decoys: ['DOG', 'FISH'] },
  ],
];
const ROUNDS = 3;

export default function RhymePop({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 2 ? 0 : 1;
  const [rounds] = useState<Round[]>(() => [...POOLS[tier]].sort(() => Math.random() - 0.5).slice(0, ROUNDS));
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState(() => shuffle(rounds[0]));
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const done = idx >= ROUNDS;

  function shuffle(r: Round) {
    return [r.answer, ...r.decoys].sort(() => Math.random() - 0.5);
  }

  function pick(choice: string) {
    if (feedback || done) return;
    if (choice === rounds[idx].answer) {
      setFeedback('right');
      setTimeout(() => {
        const next = idx + 1;
        setIdx(next);
        setFeedback(null);
        if (next >= ROUNDS) setTimeout(onDone, 500);
        else setChoices(shuffle(rounds[next]));
      }, 400);
    } else {
      setFeedback('wrong');
      setTimeout(() => setFeedback(null), 250);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '🎈 Nice rhyming!' : 'Quick break! Tap the word that rhymes'}</p>
      {!done && (
        <>
          <div className="rounded-full bg-rose-600 px-6 py-2.5 text-lg font-bold text-white">{rounds[idx].word}</div>
          <div className="flex gap-3">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={`rounded-full border-2 px-5 py-2.5 text-sm font-semibold ${
                  feedback === 'right' && c === rounds[idx].answer
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : feedback === 'wrong' && c !== rounds[idx].answer
                      ? 'border-slate-200 text-slate-400'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
