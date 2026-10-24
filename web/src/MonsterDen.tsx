import { useEffect, useState } from 'react';
import { api, EDU_SUBJECTS, type EduMonster } from './api';
import { GRADE_LABELS, SUBJECT_META } from './LearningProgress';
import MonsterArt, { monsterFor, stageFor } from './MonsterArt';

// The kid's collection: one monster per subject and grade. Befriend one by
// finishing a regular session at that grade with 8+ of 10 right; it grows
// (hatchling, grown, mega) as you master more of that grade's questions.
export default function MonsterDen({ monsters }: { monsters: EduMonster[] }) {
  const have = monsters.filter((m) => m.befriended).length;
  const byKey = new Map(monsters.map((m) => [`${m.subject}:${m.grade}`, m]));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        You've befriended <span className="font-semibold">{have}</span> of {monsters.length} monsters. Get 8 or more right in a session to
        meet one - the more you master, the bigger it grows!
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
              {row.map((r) => {
                const m = byKey.get(`${r.subject}:${r.grade}`)!;
                const def = monsterFor(r.subject, r.grade);
                const stage = stageFor(m.masteredPct);
                return (
                  <li key={r.grade} className="card-nested flex flex-col items-center gap-0.5 rounded-lg p-2 text-center" title={m.befriended ? def.blurb : 'Win a session with 8+ right to meet this one'}>
                    <MonsterArt subject={r.subject} grade={r.grade} stage={stage} silhouette={!m.befriended} size={84} />
                    <span className="text-xs font-semibold">{m.befriended ? def.name : '???'}</span>
                    <span className="text-[10px] text-slate-400">
                      {GRADE_LABELS[r.grade]} grade{m.befriended ? ` - ${stage === 3 ? 'Mega' : stage === 2 ? 'Grown' : 'Hatchling'}` : ''}
                    </span>
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
export function MonsterDenLoader({ userId, kioskToken }: { userId: string; kioskToken?: string }) {
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
  return <MonsterDen monsters={monsters} />;
}
