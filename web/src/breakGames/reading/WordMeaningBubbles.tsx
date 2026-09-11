import { useState } from 'react';

// Reading break, concept "Word Meaning Bubbles" (Recess Concepts deck).
// One word bubble up top, a fixed row of meaning-bubbles below, always the
// same distance apart. Floor is grade 2+ (has to read the meanings) - see
// the deck's own grade badge.
interface Round {
  word: string;
  answer: string;
  decoys: string[];
}
const POOLS: Round[][] = [
  [
    { word: 'happy', answer: 'feeling glad', decoys: ['feeling sad', 'feeling tired'] },
    { word: 'huge', answer: 'very big', decoys: ['very small', 'very fast'] },
    { word: 'quick', answer: 'fast', decoys: ['slow', 'quiet'] },
  ],
  [
    { word: 'enormous', answer: 'extremely large', decoys: ['extremely small', 'extremely loud'] },
    { word: 'furious', answer: 'very angry', decoys: ['very calm', 'very happy'] },
    { word: 'reluctant', answer: 'unwilling to do something', decoys: ['eager to help', 'quick to decide'] },
  ],
  [
    { word: 'meticulous', answer: 'very careful and precise', decoys: ['careless and messy', 'loud and confident'] },
    { word: 'ambiguous', answer: 'unclear or open to interpretation', decoys: ['perfectly obvious', 'extremely simple'] },
    { word: 'candid', answer: 'openly honest', decoys: ['secretive', 'confused'] },
  ],
];
const ROUNDS = 3;

export default function WordMeaningBubbles({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 1 ? 0 : grade <= 4 ? 1 : 2;
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
    const round = rounds[idx];
    if (choice === round.answer) {
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
      <p className="text-sm font-semibold text-slate-600">{done ? '💬 Nice work!' : 'Quick break! Tap what the word means'}</p>
      {!done && (
        <>
          <div className="rounded-full bg-slate-800 px-6 py-2.5 text-lg font-semibold text-white">"{rounds[idx].word}"</div>
          <div className="flex flex-col gap-2.5 w-full max-w-sm">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={`rounded-full border-2 px-4 py-2.5 text-sm ${
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
