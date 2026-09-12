import { useEffect, useState } from 'react';
import { api, EDU_SUBJECTS, type EduProgress, type EduSubject, type Member } from './api';

// Shared between LearningGamesTab.tsx (adult review of any kid, and a kid's
// own "My Progress" button in the app) and Display.tsx (the same button on
// the kiosk, kioskToken instead of a cookie session) - one rendering of
// "mastery + wrong questions + recent sessions" instead of copies that drift.
export const SUBJECT_META: Record<EduSubject, { label: string; icon: string }> = {
  MATH: { label: 'Math', icon: '🔢' },
  READING: { label: 'Reading', icon: '📖' },
  SCIENCE: { label: 'Science', icon: '🔬' },
  SPELLING: { label: 'Spelling', icon: '🔤' },
};
export const GRADE_LABELS = ['K', '1st', '2nd', '3rd', '4th', '5th', '6th'];

export function LearningProgressDetail({ progress }: { progress: EduProgress }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EDU_SUBJECTS.map((s) => {
          const sp = progress.subjects[s];
          return (
            <div key={s} className="rounded border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
                </span>
                <span className="text-xs text-slate-400">{GRADE_LABELS[sp.grade]} grade</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>✅ {sp.masteredCount} mastered</span>
                <span>❌ {sp.wrongCount} wrong</span>
                <span>⭕ {sp.untriedCount} untried</span>
                <span className="text-slate-400">of {sp.bankSize}</span>
              </div>
              {sp.accuracyPct !== null && (
                <p className="mt-1 text-xs text-slate-400">{sp.accuracyPct}% correct on questions attempted so far</p>
              )}
              {sp.wrongQuestions.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-red-500">
                    {sp.wrongQuestions.length} question{sp.wrongQuestions.length === 1 ? '' : 's'} currently wrong
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {sp.wrongQuestions.map((q) => (
                      <li key={q.id} className="rounded bg-red-50 px-2 py-1.5 text-xs text-slate-600">
                        <p>{q.prompt}</p>
                        <p className="mt-0.5 text-slate-400">
                          Correct answer: <span className="font-medium text-slate-600">{q.correctAnswer}</span>
                          {q.attempts > 1 ? ` - answered ${q.attempts} times` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {progress.recentSessions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-500">Recent sessions</p>
          <div className="mt-1.5 flex flex-col gap-1">
            {progress.recentSessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs text-slate-600">
                <span>
                  {SUBJECT_META[s.subject].icon} {SUBJECT_META[s.subject].label} - {GRADE_LABELS[s.grade]} grade
                </span>
                <span>
                  {s.status === 'DONE' ? `${s.correctCount}/${s.totalCount}${s.allCorrect ? ' 🌟' : ''}` : `in progress (${s.status})`}
                </span>
                <span className="text-slate-400">{new Date(s.startedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Fetches + renders one kid's own progress - used by the adult accordion in
// Learning settings, a kid's own "My Progress" button in the app, and the
// same button on the kiosk. `userId`/`kioskToken` swap the auth context;
// the server allows a self-lookup (actorId === targetUserId) without
// needing to be an adult - see LearningService.getProgress.
export function LearningProgressLoader({ userId, kioskToken }: { userId: string; kioskToken?: string }) {
  const [progress, setProgress] = useState<EduProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .learningProgress(userId, kioskToken)
      .then((p) => {
        if (alive) setProgress(p);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, kioskToken]);

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!progress) return <p className="text-sm text-slate-400">Couldn't load progress.</p>;
  return <LearningProgressDetail progress={progress} />;
}

// Kiosk, adult profile: Casey's own instruction - an adult standing at the
// kiosk shouldn't see the kid-facing "pick a subject and play" panel at
// all, just a glance at how the kids are doing. One row per kid, one
// accuracy chip per subject - the full wrong-question/session breakdown is
// what "My Progress" (kid) and the Learning settings accordion (adult, in
// the app) are already for; this is deliberately lighter than either.
export function KidsLearningQuickStats({ members, kioskToken }: { members: Member[]; kioskToken?: string }) {
  const kids = members.filter((m) => m.role === 'KID');
  const kidIds = kids.map((k) => k.id).join(',');
  const [progressByKid, setProgressByKid] = useState<Record<string, EduProgress | null>>({});

  useEffect(() => {
    let alive = true;
    for (const kid of kids) {
      api
        .learningProgress(kid.id, kioskToken)
        .then((p) => {
          if (alive) setProgressByKid((prev) => ({ ...prev, [kid.id]: p }));
        })
        .catch(() => {
          if (alive) setProgressByKid((prev) => ({ ...prev, [kid.id]: null }));
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidIds, kioskToken]);

  if (kids.length === 0) return <p className="text-xs text-slate-400">No kids on this display.</p>;

  return (
    <div className="flex flex-col gap-2">
      {kids.map((k) => {
        const p = progressByKid[k.id];
        return (
          <div key={k.id} className="rounded border bg-white px-2.5 py-2">
            <p className="text-sm font-medium">{k.displayName}</p>
            {p === undefined ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : p === null ? (
              <p className="text-xs text-slate-400">Couldn't load.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {EDU_SUBJECTS.map((s) => {
                  const sp = p.subjects[s];
                  return (
                    <span key={s} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500">
                      {SUBJECT_META[s].icon} {sp.accuracyPct === null ? 'new' : `${sp.accuracyPct}%`}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
