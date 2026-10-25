import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EduSubject } from './api';
import { fireworks } from './celebrate';
import { GRADE_LABELS, SUBJECT_META } from './LearningProgress';
import MonsterArt, { MonsterSticker, monsterFor } from './MonsterArt';
import TokenBadge, { tokensBadgeEnabled } from './TokenBadge';

// Full-screen "you unlocked a monster!" moment. The monster stays a mystery
// egg until this plays: the egg wobbles, cracks open (fireworks + fanfare),
// and the monster pops out with its name and the two prizes that come with it
// (a one-time token bonus and its collectible sticker). One monster at a time;
// a session that unlocks several steps through them.
export default function MonsterUnlock({
  subject,
  grades,
  bonus,
  tokenIcon,
  onDone,
}: {
  subject: EduSubject;
  grades: number[];
  bonus: Record<number, number>;
  tokenIcon: string;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [revealed, setRevealed] = useState(reduced);
  const grade = grades[i];

  useEffect(() => {
    if (revealed) {
      fireworks('eduSessionBonus');
      return;
    }
    const t = setTimeout(() => setRevealed(true), 1900);
    return () => clearTimeout(t);
  }, [revealed, i]);

  if (grade === undefined) return null;
  const def = monsterFor(subject, grade);
  const last = i === grades.length - 1;
  const tokens = bonus[grade] ?? 0;

  function next() {
    if (!revealed) {
      setRevealed(true);
      return;
    }
    if (last) onDone();
    else {
      setI(i + 1);
      setRevealed(reduced);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={revealed ? `You unlocked ${def.name}` : 'A monster is hatching'}
      onClick={next}
      className="monster-unlock"
      style={{ zIndex: 100000 }}
    >
      <div className="monster-unlock-card" onClick={(e) => e.stopPropagation()}>
        {!revealed ? (
          <>
            <div className="monster-egg-wobble">
              <MonsterArt subject={subject} grade={grade} silhouette size={190} />
            </div>
            <p className="text-lg font-bold">Something is hatching...</p>
            <p className="text-xs opacity-70">Tap to skip</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: def.accent }}>
              {SUBJECT_META[subject].icon} {GRADE_LABELS[grade]} grade monster unlocked!
            </p>
            <div className="monster-pop">
              <span className="monster-glow" style={{ background: `radial-gradient(circle, ${def.accent}88, transparent 68%)` }} />
              <MonsterArt subject={subject} grade={grade} stage={1} size={210} />
            </div>
            <h3 className="text-3xl font-extrabold">{def.name}</h3>
            <p className="max-w-xs text-sm opacity-80">{def.blurb}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="sticker-slap">
                  <MonsterSticker subject={subject} grade={grade} stage={1} size={72} />
                </span>
                <span className="text-[11px] font-semibold opacity-80">New sticker!</span>
              </div>
              {tokens > 0 && tokensBadgeEnabled() && (
                <div className="flex flex-col items-center gap-1">
                  <TokenBadge icon={tokenIcon} amount={`+${tokens}`} label="" size="lg" />
                  <span className="text-[11px] font-semibold opacity-80">Unlock bonus!</span>
                </div>
              )}
            </div>
            <button onClick={next} className="mt-2 rounded-lg px-6 py-2.5 text-base font-bold text-white" style={{ background: def.accent }}>
              {last ? 'Awesome!' : 'Next monster!'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
