import { useState } from 'react';

// Math break, concept "Ten-Frame Fill" (Recess Concepts deck). Real,
// tested K-2 classroom manipulative. Grade 3+ gets a second frame so a
// bigger target (up to 20) doesn't make this trivial - the actual fix for
// the "ceiling problem" flagged on the deck, not just a note about one.
const DOTS_PER_FRAME = 10;

export default function TenFrameFill({ grade, onDone }: { grade: number; onDone: () => void }) {
  const [target] = useState(() => {
    const max = grade <= 2 ? 10 : 20;
    return 1 + Math.floor(Math.random() * max);
  });
  const [filled, setFilled] = useState(0);
  const done = filled >= target;
  const frameCount = Math.ceil(target / DOTS_PER_FRAME);

  function tapDot(globalIndex: number) {
    if (done || globalIndex !== filled) return; // fill in order, left to right, frame by frame
    setFilled((f) => {
      const next = f + 1;
      if (next >= target) setTimeout(onDone, 700);
      return next;
    });
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">{done ? `🔟 Filled to ${target}!` : `Quick break! Tap dots to fill to ${target}`}</p>
      <div className="flex flex-col gap-4">
        {Array.from({ length: frameCount }, (_, frameIdx) => (
          <div key={frameIdx} className="grid grid-cols-5 gap-2 rounded-lg bg-slate-50 p-3">
            {Array.from({ length: DOTS_PER_FRAME }, (_, i) => {
              const globalIndex = frameIdx * DOTS_PER_FRAME + i;
              if (globalIndex >= target && globalIndex >= filled) {
                // Beyond the target - render a dim placeholder, not tappable.
                return <div key={i} className="h-9 w-9 rounded-full border-2 border-dashed border-slate-200" />;
              }
              const isFilled = globalIndex < filled;
              return (
                <button
                  key={i}
                  onClick={() => tapDot(globalIndex)}
                  disabled={isFilled}
                  className={`h-9 w-9 rounded-full border-2 ${isFilled ? 'border-amber-400 bg-amber-400' : 'border-slate-300 bg-white hover:bg-slate-100'}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
