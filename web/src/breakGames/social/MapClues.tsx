import { useState } from 'react';

// Social Studies break, concept "Map Clues" - same one-riddle-then-pick
// mechanic as reading's Detective Clues, forked here with a civics/symbols/
// community-helpers riddle pool instead of reading's animal/object one, so
// the break actually stays on-theme instead of borrowing unrelated content.
interface Round {
  riddle: string;
  answer: string;
  decoys: string[];
}
const POOLS: Round[][] = [
  [
    { riddle: 'I fly over schools and have stars and stripes. What am I?', answer: '🇺🇸 Flag', decoys: ['🎈 Balloon', '🌈 Rainbow'] },
    { riddle: 'I keep our streets safe and wear a badge. Who am I?', answer: '👮 Police Officer', decoys: ['🐶 Dog', '🎩 Top Hat'] },
    { riddle: 'I ride a big red truck and put out fires. Who am I?', answer: '🚒 Firefighter', decoys: ['🚕 Taxi Driver', '🏠 House'] },
    { riddle: 'I bring letters and packages to your door. Who am I?', answer: '📬 Mail Carrier', decoys: ['📦 Box', '🚲 Bike'] },
    { riddle: 'I help you learn to read and write every day. Who am I?', answer: '👩‍🏫 Teacher', decoys: ['📖 Book', '✏️ Pencil'] },
  ],
  [
    { riddle: 'I am the home of the President. What am I?', answer: '🏠 White House', decoys: ['🏛️ Capitol', '🗽 Statue of Liberty'] },
    { riddle: 'I stand in New York Harbor holding a torch. What am I?', answer: '🗽 Statue of Liberty', decoys: ['🏠 White House', '🔔 Liberty Bell'] },
    { riddle: 'I am the national bird of the United States. What am I?', answer: '🦅 Bald Eagle', decoys: ['🦉 Owl', '🐦 Robin'] },
    { riddle: 'I have a famous crack and once rang for freedom. What am I?', answer: '🔔 Liberty Bell', decoys: ['🗽 Statue of Liberty', '🏛️ Capitol'] },
    { riddle: 'Congress meets inside me to make our laws. What am I?', answer: '🏛️ Capitol', decoys: ['🏠 White House', '⚖️ Courthouse'] },
  ],
];
const ROUNDS = 3;

export default function MapClues({ grade, onDone }: { grade: number; onDone: () => void }) {
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
      <p className="text-sm font-semibold text-slate-600">{done ? '🗺️ Case closed!' : 'Quick break! Solve the riddle'}</p>
      {!done && (
        <>
          <p className="max-w-sm text-center text-base italic text-slate-700">"{rounds[idx].riddle}"</p>
          <div className="flex flex-wrap justify-center gap-3">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                style={feedback === 'right' && c === rounds[idx].answer ? undefined : { borderColor: 'var(--border)' }}
                className={`flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-center text-xs font-medium ${
                  feedback === 'right' && c === rounds[idx].answer
                    ? 'border-emerald-400 bg-slate-100'
                    : feedback === 'wrong' && c !== rounds[idx].answer
                      ? 'text-slate-400'
                      : 'bg-white hover:bg-slate-50'
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
