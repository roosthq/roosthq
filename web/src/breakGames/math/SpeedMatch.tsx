import { useState } from 'react';
import { randomProblem, withChoices } from './arith';

// Math break, concept "Speed Match" (Recess Concepts deck). One problem
// tile, a fixed row of answer tiles below, same distance apart every
// round. 5 correct in a row and the progress dots fill - a clear, visible
// finish line from the first frame.
const ROUNDS = 5;

export default function SpeedMatch({ grade, onDone }: { grade: number; onDone: () => void }) {
  const [round, setRound] = useState(() => withChoices(randomProblem(grade)));
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const done = correctCount >= ROUNDS;

  function pick(choice: number) {
    if (feedback || done) return;
    if (choice === round.answer) {
      setFeedback('right');
      const next = correctCount + 1;
      setTimeout(() => {
        setCorrectCount(next);
        setFeedback(null);
        if (next >= ROUNDS) {
          setTimeout(onDone, 500);
        } else {
          setRound(withChoices(randomProblem(grade)));
        }
      }, 350);
    } else {
      setFeedback('wrong');
      setTimeout(() => setFeedback(null), 250);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '⚡ Speedy!' : 'Quick break! Tap the right answer'}</p>
      <div className="flex gap-1.5">
        {Array.from({ length: ROUNDS }, (_, i) => (
          <div key={i} className={`h-2.5 w-2.5 rounded-full ${i < correctCount ? 'bg-amber-400' : 'bg-slate-200'}`} />
        ))}
      </div>
      <div className="rounded-xl bg-slate-800 px-8 py-4 text-2xl font-bold text-white">{round.prompt}</div>
      <div className="flex gap-3">
        {round.choices.map((c) => (
          <button
            key={c}
            onClick={() => pick(c)}
            className={`flex h-14 w-16 items-center justify-center rounded-lg border-2 text-lg font-semibold ${
              feedback === 'right' && c === round.answer
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : feedback === 'wrong' && c !== round.answer
                  ? 'border-slate-200 text-slate-400'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
