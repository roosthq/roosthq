import { useState } from 'react';

// Spelling break, concept "Missing Letter" (Recess Concepts deck).
// Smallest possible decision, biggest possible tap targets - the easiest
// concept in the whole deck, K-6 safe.
interface Round {
  before: string;
  after: string;
  answer: string;
  decoys: string[];
}
const POOLS: Round[][] = [
  [
    { before: 'C', after: 'T', answer: 'A', decoys: ['E', 'I'] },
    { before: 'D', after: 'G', answer: 'O', decoys: ['A', 'U'] },
    { before: 'S', after: 'N', answer: 'U', decoys: ['E', 'I'] },
  ],
  [
    { before: 'SP', after: 'CE', answer: 'A', decoys: ['O', 'U'] },
    { before: 'FRI', after: 'ND', answer: 'E', decoys: ['A', 'O'] },
    { before: 'CL', after: 'UD', answer: 'O', decoys: ['A', 'E'] },
  ],
];
const ROUNDS = 3;

export default function MissingLetter({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 2 ? 0 : 1;
  const [rounds] = useState<Round[]>(() => [...POOLS[tier]].sort(() => Math.random() - 0.5).slice(0, ROUNDS));
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState(() => shuffle(rounds[0]));
  const [filledRight, setFilledRight] = useState(false);
  const [wrong, setWrong] = useState(false);
  const done = idx >= ROUNDS;

  function shuffle(r: Round) {
    return [r.answer, ...r.decoys].sort(() => Math.random() - 0.5);
  }

  function pick(choice: string) {
    if (filledRight || done) return;
    if (choice === rounds[idx].answer) {
      setFilledRight(true);
      setTimeout(() => {
        const next = idx + 1;
        setIdx(next);
        setFilledRight(false);
        if (next >= ROUNDS) setTimeout(onDone, 500);
        else setChoices(shuffle(rounds[next]));
      }, 500);
    } else {
      setWrong(true);
      setTimeout(() => setWrong(false), 250);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '✅ All filled in!' : 'Quick break! Tap the missing letter'}</p>
      {!done && (
        <>
          <div className="flex items-center gap-1 text-3xl font-bold text-slate-700">
            <span>{rounds[idx].before}</span>
            <span className={`flex h-11 w-11 items-center justify-center rounded border-2 ${filledRight ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-dashed border-slate-300 text-slate-300'}`}>
              {filledRight ? rounds[idx].answer : '_'}
            </span>
            <span>{rounds[idx].after}</span>
          </div>
          <div className="flex gap-3">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={`flex h-14 w-14 items-center justify-center rounded-lg border-2 text-xl font-bold ${
                  wrong ? 'border-slate-300 text-slate-400' : 'border-rose-300 bg-white text-rose-600 hover:bg-rose-50'
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
