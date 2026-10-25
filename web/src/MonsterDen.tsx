import { useEffect, useState } from 'react';
import { api, EDU_SUBJECTS, type EduMonster, type EduSubject } from './api';
import { GRADE_LABELS, SUBJECT_META } from './LearningProgress';
import MonsterArt, { MonsterSticker, monsterFor, stageFor } from './MonsterArt';

// The kid's collection: one monster per subject and grade. A monster is
// befriended by mastering its WHOLE grade (the same bar that moves you up a
// grade); it then grows (hatchling, grown, mega) as you master more of it.
// Grades below your own can be hunted back at a small (or no) token payout, so
// a kid who is past a grade can still collect its monster.
export default function MonsterDen({ monsters, onHunt }: { monsters: EduMonster[]; onHunt?: (subject: EduSubject, grade: number) => void }) {
  const have = monsters.filter((m) => m.befriended).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        You've unlocked <span className="font-semibold">{have}</span> of {monsters.length} mystery monsters (each one is a sticker and a bonus prize). Master a
        whole grade to hatch its monster - the more you master, the bigger it grows! Missed one from an earlier grade? Go on a <span className="font-semibold">🏹 Hunt</span> to win it back
        (far fewer tokens, or free, the further down you go).
      </p>
      {EDU_SUBJECTS.map((s) => {
        const row = monsters.filter((m) => m.subject === s);
        if (!row.length) return null;
        return (
          <section key={s}>
            <h4 className="mb-1.5 text-sm font-semibold">
              {SUBJECT_META[s].icon} {SUBJECT_META[s].label} monsters
            </h4>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {row.map((m) => {
                const def = monsterFor(m.subject, m.grade);
                const stage = stageFor(m.masteredPct);
                const pct = m.target > 0 ? Math.min(100, Math.round((m.mastered / m.target) * 100)) : 0;
                const canHunt = !!onHunt && m.huntable;
                return (
                  <li
                    key={m.grade}
                    className="card-nested flex flex-col items-center gap-0.5 rounded-lg p-2 text-center"
                    title={m.befriended ? def.blurb : `Master ${GRADE_LABELS[m.grade]} grade ${SUBJECT_META[s].label} to meet this one`}
                  >
                    {m.befriended ? (
                      <MonsterSticker subject={m.subject} grade={m.grade} stage={stage} size={84} />
                    ) : (
                      <MonsterArt subject={m.subject} grade={m.grade} silhouette size={84} />
                    )}
                    <span className="text-xs font-semibold">{m.befriended ? def.name : '???'}</span>
                    <span className="text-[10px] text-slate-400">
                      {GRADE_LABELS[m.grade]} grade{m.befriended ? ` - ${stage === 3 ? 'Mega' : stage === 2 ? 'Grown' : 'Hatchling'}` : ''}
                    </span>
                    {!m.befriended && (
                      <>
                        <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${m.mastered} of ${m.target} mastered`}>
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {m.mastered} / {m.target}
                        </span>
                      </>
                    )}
                    {m.where === 'above' && !m.befriended && <span className="text-[10px] text-slate-400">Reach this grade first</span>}
                    {m.where === 'now' && !m.befriended && <span className="text-[10px] font-semibold text-emerald-700">Playing now</span>}
                    {canHunt && (
                      <button
                        onClick={() => onHunt?.(m.subject, m.grade)}
                        className="mt-0.5 rounded border px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        🏹 {m.befriended ? 'Grow it' : 'Hunt'} · {m.huntPayPct === 0 ? 'free' : `${m.huntPayPct}% pay`}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// The kid's Monster Den on the kiosk (the app's picker opens it from data it
// already has; the kiosk plays a subject directly, so it fetches its own).
export function MonsterDenLoader({
  userId,
  kioskToken,
  onHunt,
}: {
  userId: string;
  kioskToken?: string;
  onHunt?: (subject: EduSubject, grade: number) => void;
}) {
  const [monsters, setMonsters] = useState<EduMonster[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .learningProgress(userId, kioskToken)
      .then((p) => alive && setMonsters(p.monsters ?? []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userId, kioskToken]);
  if (failed) return <p className="text-sm text-slate-400">Couldn't load the Monster Den.</p>;
  if (!monsters) return <p className="text-sm text-slate-400">Loading…</p>;
  return <MonsterDen monsters={monsters} onHunt={onHunt} />;
}
