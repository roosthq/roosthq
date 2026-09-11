import { useState } from 'react';
import { useDragOrTapSwap, modeForGrade } from '../dragOrTap';

// Spelling break, concept "Scramble Swap" (Recess Concepts deck). A
// scrambled word sits as a fixed row of letter tiles. Grade 2+: drag one
// letter onto another to swap them. K-1: tap-then-tap, the validated
// fallback for this age (see dragOrTap.ts's own comment).
const WORDS = ['CAT', 'SUN', 'DOG', 'RUN', 'BIG', 'HAT'];
const COLORS = ['#ab3a63', '#7a4fa0', '#2e6f95', '#227d63'];

export default function ScrambleSwap({ grade, onDone }: { grade: number; onDone: () => void }) {
  const mode = modeForGrade(grade);
  const [word] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [order, setOrder] = useState<number[]>(() => {
    const idx = word.split('').map((_, i) => i);
    let s = [...idx];
    do {
      s = [...idx].sort(() => Math.random() - 0.5);
    } while (s.every((v, i) => v === idx[i]));
    return s;
  });
  const [done, setDone] = useState(false);

  const { tileProps, dragging } = useDragOrTapSwap({
    mode,
    onSwap: (aId, bId) => {
      setOrder((prev) => {
        const next = [...prev];
        const ai = next.indexOf(Number(aId));
        const bi = next.indexOf(Number(bId));
        [next[ai], next[bi]] = [next[bi], next[ai]];
        if (next.every((v, i) => v === i)) {
          setDone(true);
          setTimeout(onDone, 700);
        }
        return next;
      });
    },
  });

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {done ? `🔤 That spells ${word}!` : mode === 'drag' ? 'Quick break! Drag the letters into the right order 🔤' : 'Quick break! Tap two letters to swap them 🔤'}
      </p>
      <div className="flex gap-3">
        {order.map((origIndex) => {
          const letter = word[origIndex];
          const props = tileProps(String(origIndex));
          const isDragging = dragging?.id === String(origIndex);
          return (
            <div
              key={origIndex}
              {...props}
              style={{ touchAction: 'none', background: COLORS[origIndex % COLORS.length] }}
              className={`flex h-16 w-16 items-center justify-center rounded-xl border-2 text-2xl font-bold text-white ${
                props['data-selected'] ? 'border-amber-400' : props['data-hover'] ? 'border-emerald-400' : 'border-transparent'
              } ${isDragging ? 'opacity-30' : ''}`}
            >
              {letter}
            </div>
          );
        })}
      </div>
      {mode === 'drag' && dragging && (
        <div
          style={{
            position: 'fixed',
            left: dragging.x,
            top: dragging.y,
            transform: 'translate(-50%,-50%) scale(1.15)',
            pointerEvents: 'none',
            zIndex: 50,
            background: COLORS[Number(dragging.id) % COLORS.length],
          }}
          className="flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-bold text-white"
        >
          {word[Number(dragging.id)]}
        </div>
      )}
    </div>
  );
}
