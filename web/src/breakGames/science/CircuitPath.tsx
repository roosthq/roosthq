import { useState } from 'react';

// Science break, concept "Circuit Path" (Recess Concepts deck). A fixed
// row of wire tiles sits between a battery and a bulb. Tap tiles left to
// right; the bulb lights up the instant the last one connects. Floor is
// grade 3+ (matches the real curriculum - circuits aren't taught before
// 3rd, same floor as the actual quiz content bank).
const SEGMENTS = 4;

export default function CircuitPath({ onDone }: { grade: number; onDone: () => void }) {
  const [connected, setConnected] = useState(0);
  const done = connected >= SEGMENTS;

  function tapSegment(i: number) {
    if (i !== connected || done) return;
    const next = connected + 1;
    setConnected(next);
    if (next >= SEGMENTS) setTimeout(onDone, 700);
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? '💡 Circuit complete!' : 'Quick break! Tap the wires in order to light the bulb'}</p>
      <div className="flex items-center gap-1">
        <svg width="34" height="34" viewBox="0 0 34 34">
          <rect x="4" y="10" width="26" height="14" rx="2" fill="#3a3448" />
          <rect x="0" y="14" width="4" height="6" fill="#64748b" />
        </svg>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < connected;
          return (
            <button key={i} onClick={() => tapSegment(i)} className="flex h-8 w-12 items-center justify-center">
              <svg width="48" height="14" viewBox="0 0 48 14">
                <rect width="48" height="14" rx="3" fill={on ? '#f2c14e' : 'none'} stroke={on ? '#e0a92c' : '#cbd5e1'} strokeWidth="2" strokeDasharray={on ? '0' : '4 3'} />
              </svg>
            </button>
          );
        })}
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="14" r="11" fill={done ? '#fde68a' : 'none'} stroke={done ? '#f2c14e' : '#94a3b8'} strokeWidth="2" />
          <path d="M12 24l2 6h6l2-6" fill="none" stroke="#94a3b8" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}
