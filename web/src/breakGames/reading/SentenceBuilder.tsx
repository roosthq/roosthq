import { useState } from 'react';

// Reading break, concept "Sentence Builder" (Recess Concepts deck). A
// sentence with one blank sits up top; a fixed word bank sits below.
// Floor is grade 1+ (has to read the word bank).
interface Round {
  before: string;
  after: string;
  answer: string;
  decoys: string[];
}
const POOLS: Round[][] = [
  [
    { before: 'The dog', after: 'to the park.', answer: 'ran', decoys: ['sang', 'slept'] },
    { before: 'She', after: 'a red apple.', answer: 'ate', decoys: ['painted', 'folded'] },
    { before: 'We', after: 'a big sandcastle.', answer: 'built', decoys: ['sang', 'read'] },
  ],
  [
    { before: 'The scientist', after: 'the results carefully.', answer: 'recorded', decoys: ['ignored', 'painted'] },
    { before: 'After the storm, the sky', after: 'clear again.', answer: 'became', decoys: ['tasted', 'counted'] },
    { before: 'The team', after: 'their strategy before the game.', answer: 'discussed', decoys: ['baked', 'watered'] },
  ],
];
const ROUNDS = 3;

export default function SentenceBuilder({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 3 ? 0 : 1;
  const [rounds] = useState<Round[]>(() => [...POOLS[tier]].sort(() => Math.random() - 0.5).slice(0, ROUNDS));
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState(() => shuffle(rounds[0]));
  const [filled, setFilled] = useState<string | null>(null);
  const done = idx >= ROUNDS;

  function shuffle(r: Round) {
    return [r.answer, ...r.decoys].sort(() => Math.random() - 0.5);
  }

  function pick(choice: string) {
    if (filled || done) return;
    if (choice !== rounds[idx].answer) {
      setFilled('wrong');
      setTimeout(() => setFilled(null), 250);
      return;
    }
    setFilled(choice);
    setTimeout(() => {
      const next = idx + 1;
      setIdx(next);
      setFilled(null);
      if (next >= ROUNDS) setTimeout(onDone, 500);
      else setChoices(shuffle(rounds[next]));
    }, 500);
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '✏️ Sentence complete!' : 'Quick break! Tap the word that fits'}</p>
      {!done && (
        <>
          <p className="text-lg text-slate-700">
            {rounds[idx].before}{' '}
            <span className="inline-block min-w-16 rounded border-b-2 border-dashed border-amber-400 px-1 text-center font-semibold text-amber-600">
              {filled && filled !== 'wrong' ? filled : '____'}
            </span>{' '}
            {rounds[idx].after}
          </p>
          <div className="flex gap-3">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={`rounded-lg border-2 px-4 py-2 text-sm font-medium ${
                  filled === 'wrong' ? 'border-slate-300' : 'border-slate-300 hover:bg-slate-50'
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
