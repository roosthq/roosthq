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
  LOGIC: { label: 'Logic', icon: '🧩' },
  SOCIAL: { label: 'Social Studies', icon: '🌍' },
};
export const GRADE_LABELS = ['K', '1st', '2nd', '3rd', '4th', '5th', '6th'];

// `hideCounts` is the kid's-own-view mode (Casey's own instruction: show
// grade + a progress bar toward the next one, never the raw question
// counts) - the adult-review call sites (LearningGamesTab's per-kid
// accordion, and Display.tsx when the active kiosk profile isn't a KID)
// leave it off and get the full numeric breakdown unchanged.
export function LearningProgressDetail({ progress, hideCounts = false }: { progress: EduProgress; hideCounts?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EDU_SUBJECTS.map((s) => {
          const sp = progress.subjects[s];
          const pct = sp.bankSize > 0 ? Math.min(100, Math.round((sp.masteredCount / sp.bankSize) * 100)) : 0;
          return (
            <div key={s} className="rounded border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
                </span>
                <span className="text-xs text-slate-400">{GRADE_LABELS[sp.grade]} grade</span>
              </div>
              {hideCounts ? (
                sp.locked ? (
                  <p className="mt-1.5 text-xs font-medium text-emerald-700">🎉 Mastered every question so far - more coming soon!</p>
                ) : (
                  <div className="mt-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Working toward {GRADE_LABELS[Math.min(6, sp.grade + 1)]} grade</p>
                  </div>
                )
              ) : (
                <>
                  {/* Same bar the kid sees on their own view (hideCounts) -
                      Casey's own ask: an adult gets the visual progress bar
                      TOO, in addition to the raw numbers below, not instead
                      of them. */}
                  <div className="mt-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                    </div>
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
                  {sp.locked && <p className="mt-1 text-xs font-medium text-emerald-700">🎉 Maxed out - waiting on a higher grade's questions.</p>}
                </>
              )}
              {sp.wrongQuestions.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-red-500">
                    {hideCounts ? 'Questions to review' : `${sp.wrongQuestions.length} question${sp.wrongQuestions.length === 1 ? '' : 's'} currently wrong`}
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {sp.wrongQuestions.map((q) => (
                      <li key={q.id} className="bg-slate-100 rounded px-2 py-1.5 text-xs text-slate-600">
                        <p>{q.prompt}</p>
                        <p className="mt-0.5 text-slate-400">
                          Correct answer: <span className="font-medium text-slate-600">{q.correctAnswer}</span>
                          {!hideCounts && q.attempts > 1 ? ` - answered ${q.attempts} times` : ''}
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
                  {s.status === 'DONE'
                    ? `${s.correctCount}/${s.totalCount}${s.allCorrect ? ' 🌟' : ''}`
                    : s.status === 'ABANDONED'
                      ? 'quit early'
                      : `in progress (${s.status})`}
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
export function LearningProgressLoader({ userId, kioskToken, hideCounts = false }: { userId: string; kioskToken?: string; hideCounts?: boolean }) {
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
  return <LearningProgressDetail progress={progress} hideCounts={hideCounts} />;
}

// Adult review, per kid: mastery/grade/progress bar, questions they're
// currently getting wrong, and recent sessions - lazy-fetched on open (bank-
// size + progress queries per subject aren't free, no reason to run them for
// every kid up front). Shared between the Learning settings tab (cookie
// session) and the kiosk's adult profile view (`kioskToken` instead) -
// Casey's own instruction: the kiosk used to swap in a tiny accuracy-chip
// summary instead of this (KidsLearningQuickStats, removed) on the theory
// that a glance was enough; it wasn't - too small to actually read, and
// missing the grade/progress-bar/count detail an adult standing at the
// kiosk wants exactly as much as one reviewing from Settings does.
export function KidProgress({ members, kioskToken }: { members: Member[]; kioskToken?: string }) {
  const kids = members.filter((m) => m.role === 'KID');
  const [openId, setOpenId] = useState<string | null>(null);

  if (kids.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {kids.map((k) => (
        <div key={k.id} className="rounded border bg-white">
          <button
            onClick={() => setOpenId(openId === k.id ? null : k.id)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
          >
            <span>{k.displayName}</span>
            <span className="text-slate-400">{openId === k.id ? '▲' : '▼'}</span>
          </button>
          {openId === k.id && (
            <div className="border-t p-3">
              <LearningProgressLoader userId={k.id} kioskToken={kioskToken} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
