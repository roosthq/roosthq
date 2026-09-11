import { useState } from 'react';
import { randomProblem, withChoices } from './arith';

// Math break, concept "Path to the Flag" (Recess Concepts deck). A fixed
// row of 5 stones leads to a flag - the whole path and the finish are
// visible from the first frame. The current stone's answer choices sit
// right below it; solve it correctly to light the stone and move to the
// next one.
const STEPS = 5;

export default function PathToFlag({ grade, onDone }: { grade: number; onDone: () => void }) {
  const [rounds] = useState(() => Array.from({ length: STEPS }, () => withChoices(randomProblem(grade))));
  const [lit, setLit] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const done = lit >= STEPS;

  function pick(choice: number) {
    if (feedback || done) return;
    const current = rounds[lit];
    if (choice === current.answer) {
      setFeedback('right');
      setTimeout(() => {
        const next = lit + 1;
        setLit(next);
        setFeedback(null);
        if (next >= STEPS) setTimeout(onDone, 500);
      }, 350);
    } else {
      setFeedback('wrong');
      setTimeout(() => setFeedback(null), 250);
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '🏁 Reached the flag!' : 'Quick break! Solve each stone to light a path to the flag'}</p>
      <div className="flex items-center gap-2">
        {rounds.map((r, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`flex h-11 w-14 items-center justify-center rounded-lg text-xs font-bold text-white ${
                i < lit ? 'bg-emerald-500' : i === lit ? 'bg-slate-800' : 'bg-slate-300'
              }`}
            >
              {i < lit ? '✓' : i === lit ? r.prompt : ''}
            </div>
          </div>
        ))}
        <div className="text-3xl">🏁</div>
      </div>
      {!done && (
        <div className="flex gap-3">
          {rounds[lit].choices.map((c) => (
            <button
              key={c}
              onClick={() => pick(c)}
              className={`flex h-14 w-16 items-center justify-center rounded-lg border-2 text-lg font-semibold ${
                feedback === 'right' && c === rounds[lit].answer
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : feedback === 'wrong' && c !== rounds[lit].answer
                    ? 'border-slate-200 text-slate-400'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
