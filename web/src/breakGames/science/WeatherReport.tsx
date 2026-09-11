import { useState, type ReactElement } from 'react';

// Science break, concept "Weather Report" (Recess Concepts deck). A
// one-line scenario up top, a fixed set of weather-icon cards below. Real
// hand-drawn icons, not emoji - same bar as the rest of the deck.
type WeatherId = 'sun' | 'rain' | 'snow' | 'cloud';
interface Round {
  scenario: string;
  answer: WeatherId;
  decoys: WeatherId[];
}
const POOLS: Round[][] = [
  [
    { scenario: 'It is hot and bright outside.', answer: 'sun', decoys: ['snow', 'rain'] },
    { scenario: 'Water is falling from gray clouds.', answer: 'rain', decoys: ['sun', 'snow'] },
    { scenario: 'Cold, white flakes are falling.', answer: 'snow', decoys: ['sun', 'cloud'] },
  ],
  [
    { scenario: 'The sky is gray and it might rain soon.', answer: 'cloud', decoys: ['sun', 'snow'] },
    { scenario: 'It is freezing and everything is covered in white.', answer: 'snow', decoys: ['rain', 'sun'] },
    { scenario: 'There is not a cloud in the sky and it is very warm.', answer: 'sun', decoys: ['rain', 'cloud'] },
  ],
];
const ROUNDS = 3;

function SunIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="9" fill="#f2c14e" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line key={deg} x1="20" y1="4" x2="20" y2="9" stroke="#f2c14e" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${deg} 20 20)`} />
      ))}
    </svg>
  );
}
function RainIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M10 18a7 7 0 01 1-14 9 9 0 0117 2 6 6 0 01-1 12z" fill="#94a3b8" />
      <line x1="14" y1="24" x2="12" y2="32" stroke="#4aa3d8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="24" x2="18" y2="32" stroke="#4aa3d8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="26" y1="24" x2="24" y2="32" stroke="#4aa3d8" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function SnowIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M10 18a7 7 0 01 1-14 9 9 0 0117 2 6 6 0 01-1 12z" fill="#c7d6e6" />
      {[15, 20, 25].map((cx) => (
        <g key={cx}>
          <line x1={cx} y1="24" x2={cx} y2="32" stroke="#7fb0d6" strokeWidth="2" />
          <line x1={cx - 3} y1="28" x2={cx + 3} y2="28" stroke="#7fb0d6" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
function CloudIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M10 24a7 7 0 01 1-14 9 9 0 0117 2 6 6 0 01-1 12z" fill="#b7bfc9" />
    </svg>
  );
}
const ICONS: Record<WeatherId, (p: { size: number }) => ReactElement> = { sun: SunIcon, rain: RainIcon, snow: SnowIcon, cloud: CloudIcon };
const NAMES: Record<WeatherId, string> = { sun: 'Sunny', rain: 'Rainy', snow: 'Snowy', cloud: 'Cloudy' };

export default function WeatherReport({ grade, onDone }: { grade: number; onDone: () => void }) {
  const tier = grade <= 2 ? 0 : 1;
  const [rounds] = useState<Round[]>(() => [...POOLS[tier]].sort(() => Math.random() - 0.5).slice(0, ROUNDS));
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState(() => shuffle(rounds[0]));
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const done = idx >= ROUNDS;

  function shuffle(r: Round) {
    return [r.answer, ...r.decoys].sort(() => Math.random() - 0.5);
  }

  function pick(choice: WeatherId) {
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
      <p className="text-sm font-semibold text-slate-600">{done ? '🌦️ Forecast complete!' : 'Quick break! Tap the matching weather'}</p>
      {!done && (
        <>
          <p className="max-w-sm text-center text-base italic text-slate-700">"{rounds[idx].scenario}"</p>
          <div className="flex gap-3">
            {choices.map((c) => {
              const Icon = ICONS[c];
              return (
                <button
                  key={c}
                  onClick={() => pick(c)}
                  className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 text-[11px] font-medium ${
                    feedback === 'right' && c === rounds[idx].answer
                      ? 'border-emerald-400 bg-emerald-50'
                      : feedback === 'wrong' && c !== rounds[idx].answer
                        ? 'border-slate-200 opacity-50'
                        : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Icon size={34} />
                  <span>{NAMES[c]}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
