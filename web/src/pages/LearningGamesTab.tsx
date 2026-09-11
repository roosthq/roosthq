import { useEffect, useState } from 'react';
import { api, EDU_SUBJECTS, type EduSubject, type EduGradeRow, type EduQuestionForPlay, type EduSessionStart, type Member } from '../api';
import RocketRacer from '../RocketRacer';
import { celebrate } from '../celebrate';

// Learning games (PLANNING.md §19) - grade-level quiz per subject, a
// subject-specific arcade break in the middle, tokens per correct answer,
// bonus draw on a perfect session. Separate feature from the skill-mechanic
// mini-games in MiniGamesTab.tsx - no pool/config editor here, the grade
// level IS the only per-kid setting.

const SUBJECT_META: Record<EduSubject, { label: string; icon: string }> = {
  MATH: { label: 'Math', icon: '🔢' },
  READING: { label: 'Reading', icon: '📖' },
  SCIENCE: { label: 'Science', icon: '🔬' },
  SPELLING: { label: 'Spelling', icon: '🔤' },
};
const GRADE_LABELS = ['K', '1st', '2nd', '3rd', '4th', '5th', '6th'];

export default function LearningGamesTab({ isAdult, members, tokenIcon }: { isAdult: boolean; members: Member[]; tokenIcon: string }) {
  return isAdult ? <GradeSettings members={members} /> : <PlaySession tokenIcon={tokenIcon} />;
}

// ---------------- Adult: per-kid, per-subject grade level ----------------

function GradeSettings({ members }: { members: Member[] }) {
  const [rows, setRows] = useState<EduGradeRow[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // `${userId}-${subject}` while a PATCH is in flight

  useEffect(() => {
    api.learningGrades().then(setRows).catch(() => setRows([]));
  }, []);

  async function setGrade(userId: string, subject: EduSubject, grade: number) {
    const key = `${userId}-${subject}`;
    setSaving(key);
    try {
      await api.setLearningGrade(userId, subject, grade);
      setRows((prev) => prev?.map((r) => (r.userId === userId ? { ...r, subjects: { ...r.subjects, [subject]: grade } } : r)) ?? prev);
    } finally {
      setSaving((s) => (s === key ? null : s));
    }
  }

  if (rows === null) return <p className="mt-4 text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) return <p className="mt-4 text-sm text-slate-400">No kids on the family yet.</p>;

  return (
    <div className="mt-4">
      <p className="text-xs text-slate-400">
        Grade level per kid, per subject - drives which questions they get. Defaults from birthday until you set one; a kid moving up a
        grade mid-year is your call, not automatic.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-2 font-medium">Kid</th>
              {EDU_SUBJECTS.map((s) => (
                <th key={s} className="p-2 font-medium">
                  {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t">
                <td className="p-2 font-medium">{members.find((m) => m.id === r.userId)?.displayName ?? r.displayName}</td>
                {EDU_SUBJECTS.map((s) => (
                  <td key={s} className="p-2">
                    <select
                      className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                      value={r.subjects[s]}
                      disabled={saving === `${r.userId}-${s}`}
                      onChange={(e) => setGrade(r.userId, s, Number(e.target.value))}
                    >
                      {GRADE_LABELS.map((label, grade) => (
                        <option key={grade} value={grade}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Kid: pick a subject, play a session ----------------

type Phase = 'PICK_SUBJECT' | 'STARTING' | 'QUESTION' | 'FEEDBACK' | 'BREAK' | 'DONE';

function PlaySession({ tokenIcon }: { tokenIcon: string }) {
  const [phase, setPhase] = useState<Phase>('PICK_SUBJECT');
  const [session, setSession] = useState<EduSessionStart | null>(null);
  const [questions, setQuestions] = useState<EduQuestionForPlay[]>([]);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState('');
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [summary, setSummary] = useState<{ allCorrect: boolean; bonusTokens: number } | null>(null);

  async function start(subject: EduSubject) {
    setPhase('STARTING');
    try {
      const s = await api.startLearningSession(subject);
      setSession(s);
      setQuestions(s.questions);
      setIndex(0);
      setSessionTokens(0);
      setPhase('QUESTION');
    } catch {
      setPhase('PICK_SUBJECT');
    }
  }

  async function submit() {
    if (!session || !given.trim()) return;
    const q = questions[index];
    const result = await api.answerLearningQuestion(session.sessionId, q.id, given.trim());
    setFeedback({ correct: result.correct, correctAnswer: result.correctAnswer });
    setSessionTokens((t) => t + result.tokensAwarded);
    setPhase('FEEDBACK');
    if (result.phase === 'DONE') {
      setSummary({ allCorrect: !!result.allCorrect, bonusTokens: result.bonusTokens ?? 0 });
    }
  }

  function next() {
    setGiven('');
    setFeedback(null);
    if (summary) {
      setPhase('DONE');
      return;
    }
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPhase('QUESTION');
      return;
    }
    // Block just finished - if there's no summary yet, block A ended and
    // the break is next; advance() (called from the break's onDone) fetches
    // block B fresh.
    setPhase('BREAK');
  }

  async function afterBreak() {
    if (!session) return;
    const nextBlock = await api.advanceLearningSession(session.sessionId);
    setQuestions(nextBlock.questions);
    setIndex(0);
    setPhase('QUESTION');
  }

  function playAgain() {
    setSession(null);
    setQuestions([]);
    setSummary(null);
    setPhase('PICK_SUBJECT');
  }

  if (phase === 'PICK_SUBJECT' || phase === 'STARTING') {
    return (
      <div className="mt-4">
        <p className="text-sm text-slate-500">Pick a subject to play - 5 questions, a quick break, 5 more, tokens for every one you get right.</p>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {EDU_SUBJECTS.map((s) => (
            <li key={s}>
              <button
                onClick={() => start(s)}
                disabled={phase === 'STARTING'}
                className="flex w-full flex-col items-center gap-2 rounded-xl border bg-white p-5 text-center hover:shadow-sm disabled:opacity-50"
              >
                <span className="text-4xl">{SUBJECT_META[s].icon}</span>
                <span className="font-semibold">{SUBJECT_META[s].label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (phase === 'BREAK') {
    return (
      <div className="mt-4">
        <RocketRacer onDone={afterBreak} />
      </div>
    );
  }

  if (phase === 'DONE' && summary) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border bg-white p-8 text-center">
        <div className="text-2xl font-bold">{summary.allCorrect ? '🌟 Perfect session!' : 'Session complete!'}</div>
        <div className="flex items-center gap-2 text-lg">
          <span>{tokenIcon}</span>
          <span className="font-semibold">{sessionTokens} earned</span>
        </div>
        {summary.allCorrect && summary.bonusTokens > 0 && (
          <p className="text-sm text-amber-600">Got every question right - +{summary.bonusTokens} bonus {tokenIcon}!</p>
        )}
        <button
          onClick={(e) => {
            celebrate(e.currentTarget, 'choreCompleted');
            playAgain();
          }}
          className="mt-2 rounded-lg bg-slate-800 px-5 py-2 font-semibold text-white hover:bg-slate-700"
        >
          Play again
        </button>
      </div>
    );
  }

  const q = questions[index];
  if (!q) return null;

  return (
    <div className="mt-4 flex flex-col items-center gap-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <span>
            {tokenIcon} {sessionTokens}
          </span>
        </div>
        <p className="text-lg font-semibold">{q.prompt}</p>

        {phase === 'QUESTION' && (
          <div className="mt-4">
            {q.type === 'MULTIPLE_CHOICE' && q.choices ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.choices.map((c) => (
                  <button
                    key={c}
                    onClick={() => setGiven(c)}
                    className={`rounded-lg border px-3 py-2 text-sm ${given === c ? 'border-slate-800 bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <input
                autoFocus
                className="mt-1 w-full rounded border px-3 py-2 text-lg"
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Type your answer"
              />
            )}
            <button
              onClick={submit}
              disabled={!given.trim()}
              className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        )}

        {phase === 'FEEDBACK' && feedback && (
          <div className="mt-4">
            <p className={`text-lg font-bold ${feedback.correct ? 'text-green-600' : 'text-red-500'}`}>
              {feedback.correct ? '✅ Correct!' : `❌ Not quite - it was "${feedback.correctAnswer}"`}
            </p>
            <button onClick={next} className="mt-4 w-full rounded-lg bg-slate-800 py-2.5 font-semibold text-white hover:bg-slate-700">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
