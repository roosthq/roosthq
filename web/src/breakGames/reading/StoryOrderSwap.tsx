import { useState, type ReactElement } from 'react';
import { useDragOrTapSwap, modeForGrade } from '../dragOrTap';

// Reading break, concept "Story Order Swap" (Recess Concepts deck). 4
// picture cards sit scrambled in a fixed row. Grade 2+: drag one card onto
// another to swap them. K-1: tap one, then tap another - the validated
// tap-to-tap fallback, not a compromise (see dragOrTap.ts's own comment).
// Direct match for Toy Theater's Story Sequence game.
type StepId = 1 | 2 | 3 | 4;
const ORDER: StepId[] = [1, 2, 3, 4];

function WakeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="18" r="9" fill="#f2c14e" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line key={deg} x1="20" y1="4" x2="20" y2="8" stroke="#f2c14e" strokeWidth="2" transform={`rotate(${deg} 20 18)`} />
      ))}
      <path d="M8 32c4-4 20-4 24 0" stroke="#8b90a4" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function DressIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M14 8l6 4 6-4 6 6-5 4v18H13V18l-5-4z" fill="#5b8def" />
    </svg>
  );
}
function BreakfastIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <ellipse cx="20" cy="26" rx="14" ry="7" fill="#e5484d" />
      <path d="M6 26a14 7 0 0028 0" fill="#f7c4c4" />
      <path d="M30 14l4-6" stroke="#8b90a4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function SchoolIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect x="8" y="16" width="24" height="18" fill="#c9975a" />
      <polygon points="6,16 34,16 20,6" fill="#a1723d" />
      <rect x="17" y="24" width="6" height="10" fill="#5b3a1e" />
    </svg>
  );
}
const ICONS: Record<StepId, (p: { size: number }) => ReactElement> = { 1: WakeIcon, 2: DressIcon, 3: BreakfastIcon, 4: SchoolIcon };
const LABELS: Record<StepId, string> = { 1: 'Wake up', 2: 'Get dressed', 3: 'Eat breakfast', 4: 'Walk to school' };

export default function StoryOrderSwap({ grade, onDone }: { grade: number; onDone: () => void }) {
  const mode = modeForGrade(grade);
  const [order, setOrder] = useState<StepId[]>(() => {
    let s = [...ORDER];
    do {
      s = [...ORDER].sort(() => Math.random() - 0.5);
    } while (s.every((v, i) => v === ORDER[i]));
    return s;
  });
  const [done, setDone] = useState(false);

  const { tileProps, dragging } = useDragOrTapSwap({
    mode,
    onSwap: (aId, bId) => {
      setOrder((prev) => {
        const next = [...prev];
        const ai = next.indexOf(Number(aId) as StepId);
        const bi = next.indexOf(Number(bId) as StepId);
        [next[ai], next[bi]] = [next[bi], next[ai]];
        if (next.every((v, i) => v === ORDER[i])) {
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
        {done ? '📖 That\'s the right order!' : mode === 'drag' ? 'Quick break! Drag the cards into story order 📖' : 'Quick break! Tap two cards to swap them into order 📖'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {order.map((step) => {
          const Icon = ICONS[step];
          const props = tileProps(String(step));
          const isDragging = dragging?.id === String(step);
          return (
            <div
              key={step}
              {...props}
              style={{ touchAction: 'none' }}
              className={`flex w-24 flex-col items-center gap-1 rounded-lg border-2 bg-white p-3 ${
                props['data-selected'] ? 'border-amber-400' : props['data-hover'] ? 'border-emerald-400' : 'border-slate-200'
              } ${isDragging ? 'opacity-30' : ''}`}
            >
              <Icon size={40} />
              <span className="text-center text-[11px] text-slate-500">{LABELS[step]}</span>
            </div>
          );
        })}
      </div>
      {mode === 'drag' && dragging && (
        <div
          style={{ position: 'fixed', left: dragging.x, top: dragging.y, transform: 'translate(-50%,-50%) scale(1.15)', pointerEvents: 'none', zIndex: 50 }}
          className="flex w-24 flex-col items-center gap-1 rounded-lg border-2 border-amber-400 bg-white p-3"
        >
          {ICONS[Number(dragging.id) as StepId]({ size: 40 })}
        </div>
      )}
    </div>
  );
}
