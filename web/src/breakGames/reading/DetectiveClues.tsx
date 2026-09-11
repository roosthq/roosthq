import { useState } from 'react';

// Reading break, concept "Detective Clues" (Recess Concepts deck). A
// one-line riddle up top, a small fixed set of answer cards below. K-6
// safe - picture/text-card forward, low reading load.
interface Round {
  riddle: string;
  answer: string;
  decoys: string[];
}
const POOLS: Round[][] = [
  [
    { riddle: 'I have wheels but no engine. What am I?', answer: '🚲 Bike', decoys: ['🐳 Whale', '🍎 Apple'] },
    { riddle: 'I am cold, white, and I melt. What am I?', answer: '❄️ Snow', decoys: ['🔥 Fire', '🌻 Flower'] },
    { riddle: 'I have a trunk but I am not a tree. What am I?', answer: '🐘 Elephant', decoys: ['🚗 Car', '📚 Book'] },
  ],
  [
    { riddle: 'I have keys but open no locks. What am I?', answer: '🎹 Piano', decoys: ['🔑 Key', '🚪 Door'] },
    { riddle: 'I get shorter as I work. What am I?', answer: '🕯️ Candle', decoys: ['📏 Ruler', '⏰ Clock'] },
    { riddle: 'I have a face and hands but no body. What am I?', answer: '🕐 Clock', decoys: ['🤖 Robot', '🧤 Glove'] },
  ],
];
const ROUNDS = 3;

export default function DetectiveClues({ grade, onDone }: { grade: number; onDone: () => void }) {
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
      <p className="text-sm font-semibold text-slate-600">{done ? '🔎 Case closed!' : 'Quick break! Solve the riddle'}</p>
      {!done && (
        <>
          <p className="max-w-sm text-center text-base italic text-slate-700">"{rounds[idx].riddle}"</p>
          <div className="flex gap-3">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={`flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-medium ${
                  feedback === 'right' && c === rounds[idx].answer
                    ? 'border-emerald-400 bg-emerald-50'
                    : feedback === 'wrong' && c !== rounds[idx].answer
                      ? 'border-slate-200 text-slate-400'
                      : 'border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="text-2xl">{c.split(' ')[0]}</span>
                <span>{c.split(' ').slice(1).join(' ')}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
