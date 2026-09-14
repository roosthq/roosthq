import { useState, type ReactElement } from 'react';
import { useDragOrTapSwap, modeForGrade } from '../dragOrTap';

// Social Studies break, concept "Timeline Order" - same swap-into-order
// mechanic as reading's Story Order Swap, forked with a 4-stage US history
// timeline instead. Kept to the most bulletproof, universally-taught
// framing (no specific dates) so the "story" itself stays factually safe:
// Native peoples were here first -> colonists arrived by ship -> the
// colonies became their own country -> that's the country we live in today.
type StepId = 1 | 2 | 3 | 4;
const ORDER: StepId[] = [1, 2, 3, 4];

function FirstPeoplesIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M20 6l10 28H10z" fill="#c9975a" />
      <path d="M20 6l4 28h-8z" fill="#a1723d" />
      <circle cx="20" cy="16" r="2" fill="#5b3a1e" />
    </svg>
  );
}
function ShipIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M6 26h28l-4 8H10z" fill="#8b5a2b" />
      <rect x="19" y="6" width="2" height="20" fill="#5b3a1e" />
      <path d="M21 8l12 8-12 4z" fill="#e5e5e5" />
      <path d="M19 10l-9 8 9 2z" fill="#f5f5f5" />
    </svg>
  );
}
function DeclarationIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect x="10" y="6" width="20" height="26" rx="2" fill="#f2e6c9" />
      <line x1="14" y1="13" x2="26" y2="13" stroke="#8b90a4" strokeWidth="1.5" />
      <line x1="14" y1="18" x2="26" y2="18" stroke="#8b90a4" strokeWidth="1.5" />
      <line x1="14" y1="23" x2="22" y2="23" stroke="#8b90a4" strokeWidth="1.5" />
      <path d="M27 27l6 6-2 2-6-6z" fill="#5b3a1e" />
    </svg>
  );
}
function FlagIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect x="10" y="4" width="2" height="32" fill="#5b3a1e" />
      <rect x="12" y="6" width="18" height="14" fill="#e5484d" />
      <rect x="12" y="6" width="7" height="7" fill="#3a5fc4" />
    </svg>
  );
}
const ICONS: Record<StepId, (p: { size: number }) => ReactElement> = { 1: FirstPeoplesIcon, 2: ShipIcon, 3: DeclarationIcon, 4: FlagIcon };
const LABELS: Record<StepId, string> = {
  1: 'Native peoples lived here first',
  2: 'Colonists sailed over by ship',
  3: 'The colonies became their own country',
  4: 'That country is home today',
};

export default function TimelineOrder({ grade, onDone }: { grade: number; onDone: () => void }) {
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
        {done ? '🕰️ That\'s the right timeline order!' : mode === 'drag' ? 'Quick break! Drag the cards into timeline order 🕰️' : 'Quick break! Tap two cards to swap them into order 🕰️'}
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
              style={{ touchAction: 'none', ...(props['data-selected'] || props['data-hover'] ? {} : { borderColor: 'var(--border)' }) }}
              className={`flex w-28 flex-col items-center gap-1 rounded-lg border-2 bg-white p-3 ${
                props['data-selected'] ? 'border-amber-400' : props['data-hover'] ? 'border-emerald-400' : ''
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
          className="flex w-28 flex-col items-center gap-1 rounded-lg border-2 border-amber-400 bg-white p-3"
        >
          {ICONS[Number(dragging.id) as StepId]({ size: 40 })}
        </div>
      )}
    </div>
  );
}
