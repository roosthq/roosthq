import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  api,
  EDU_SUBJECTS,
  type EduSubject,
  type EduGradeRow,
  type EduQuestionForPlay,
  type EduSessionStart,
  type Member,
  type PoolEntry,
  type StorePrize,
} from '../api';
import { celebrate } from '../celebrate';
import TokenBadge from '../TokenBadge';
import PoolEditor from '../PoolEditor';
import QuestionVisual from '../QuestionVisual';
import Modal from '../Modal';
import { SUBJECT_META, GRADE_LABELS, LearningProgressLoader } from '../LearningProgress';

import TenFrameFill from '../breakGames/math/TenFrameFill';
import NumberPopLadder from '../breakGames/math/NumberPopLadder';
import BalanceBuilder from '../breakGames/math/BalanceBuilder';
import SpeedMatch from '../breakGames/math/SpeedMatch';
import PathToFlag from '../breakGames/math/PathToFlag';
import StoryOrderSwap from '../breakGames/reading/StoryOrderSwap';
import RhymeMatch from '../breakGames/reading/RhymeMatch';
import WordMeaningBubbles from '../breakGames/reading/WordMeaningBubbles';
import SentenceBuilder from '../breakGames/reading/SentenceBuilder';
import DetectiveClues from '../breakGames/reading/DetectiveClues';
import HabitatSort from '../breakGames/science/HabitatSort';
import LifeCycleRing from '../breakGames/science/LifeCycleRing';
import StateMatch from '../breakGames/science/StateMatch';
import CircuitPath from '../breakGames/science/CircuitPath';
import WeatherReport from '../breakGames/science/WeatherReport';
import LetterLadder from '../breakGames/spelling/LetterLadder';
import ScrambleSwap from '../breakGames/spelling/ScrambleSwap';
import MissingLetter from '../breakGames/spelling/MissingLetter';
import WordGridSnap from '../breakGames/spelling/WordGridSnap';
import RhymePop from '../breakGames/spelling/RhymePop';

// Each subject's own pool of 5 arcade breaks (PLANNING.md §19 "Recess
// Concepts" - Casey's own review after the first pass, real research
// grounding each one). A grade-gated one only appears in the pool once the
// kid's actual grade clears it - no more picking a concept that can't work
// for this kid. Picked at random each break, never the same one twice in a
// row within one session (pickBreakGame below).
interface BreakGameEntry {
  Component: (p: { grade: number; onDone: () => void }) => ReactElement;
  minGrade: number;
  label: string;
}
const BREAK_GAMES: Record<EduSubject, BreakGameEntry[]> = {
  MATH: [
    { Component: TenFrameFill, minGrade: 0, label: 'Ten Frame Fill' },
    { Component: NumberPopLadder, minGrade: 0, label: 'Number Pop Ladder' },
    { Component: BalanceBuilder, minGrade: 1, label: 'Balance Builder' },
    { Component: SpeedMatch, minGrade: 0, label: 'Speed Match' },
    { Component: PathToFlag, minGrade: 0, label: 'Path to Flag' },
  ],
  READING: [
    { Component: StoryOrderSwap, minGrade: 0, label: 'Story Order Swap' },
    { Component: RhymeMatch, minGrade: 0, label: 'Rhyme Match' },
    { Component: WordMeaningBubbles, minGrade: 2, label: 'Word Meaning Bubbles' },
    { Component: SentenceBuilder, minGrade: 1, label: 'Sentence Builder' },
    { Component: DetectiveClues, minGrade: 0, label: 'Detective Clues' },
  ],
  SCIENCE: [
    { Component: HabitatSort, minGrade: 0, label: 'Habitat Sort' },
    { Component: LifeCycleRing, minGrade: 2, label: 'Life Cycle Ring' },
    { Component: StateMatch, minGrade: 0, label: 'State Match' },
    { Component: CircuitPath, minGrade: 3, label: 'Circuit Path' },
    { Component: WeatherReport, minGrade: 0, label: 'Weather Report' },
  ],
  SPELLING: [
    { Component: LetterLadder, minGrade: 0, label: 'Letter Ladder' },
    { Component: ScrambleSwap, minGrade: 0, label: 'Scramble Swap' },
    { Component: MissingLetter, minGrade: 0, label: 'Missing Letter' },
    { Component: WordGridSnap, minGrade: 0, label: 'Word Grid Snap' },
    { Component: RhymePop, minGrade: 0, label: 'Rhyme Pop' },
  ],
};

function pickBreakGame(subject: EduSubject, grade: number, lastComponent: unknown) {
  const eligible = BREAK_GAMES[subject].filter((g) => grade >= g.minGrade);
  const pool = eligible.length > 1 ? eligible.filter((g) => g.Component !== lastComponent) : eligible;
  return pool[Math.floor(Math.random() * pool.length)].Component;
}

// Learning games (PLANNING.md §19) - grade-level quiz per subject, a
// subject-specific arcade break in the middle, tokens per correct answer,
// bonus draw on a perfect session. Separate feature from the skill-mechanic
// mini-games in MiniGamesTab.tsx - grade level is per-kid, but the payout
// (tokens/correct-answer + the all-correct bonus pool) is one family-wide
// setting (PayoutSettings below), same PoolEditor as Award/MiniGame.

export default function LearningGamesTab({
  isAdult,
  members,
  tokenIcon,
  myUserId,
}: {
  isAdult: boolean;
  members: Member[];
  tokenIcon: string;
  myUserId: string;
}) {
  return isAdult ? (
    <div className="mt-4 flex flex-col gap-6">
      <PayoutSettings />
      <GradeSettings members={members} />
      <KidProgress members={members} />
      <BreakGamePreview />
    </div>
  ) : (
    <PlaySession tokenIcon={tokenIcon} myUserId={myUserId} />
  );
}

// ---------------- Adult: tokens per correct + all-correct bonus pool ----------------

function PayoutSettings() {
  const [tokensPerCorrect, setTokensPerCorrect] = useState<number | null>(null);
  const [bonusPool, setBonusPool] = useState<PoolEntry[]>([]);
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.learningSettings().then((s) => {
      setTokensPerCorrect(s.tokensPerCorrect);
      setBonusPool(s.bonusPool);
    });
    // Full non-archived list, not pre-filtered to AWARD_ONLY - PoolEditor
    // does that filtering itself (same reason MiniGamesTab fetches it this
    // way - see that file's own comment).
    api.prizes().then(setPrizes).catch(() => setPrizes([]));
  }, []);

  async function save() {
    if (tokensPerCorrect === null || bonusPool.length === 0) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateLearningSettings(tokensPerCorrect, bonusPool);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (tokensPerCorrect === null) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="font-semibold">Payout</h3>
      <p className="text-xs text-slate-400">Family-wide, not per subject - the same tokens-per-question and bonus pool for every subject.</p>

      <label className="mt-3 block text-sm">
        <span className="text-slate-500">Tokens per correct answer</span>
        <input
          type="number"
          min={0}
          className="mt-1 w-24 rounded border px-2 py-1.5 text-sm"
          value={tokensPerCorrect}
          onChange={(e) => setTokensPerCorrect(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          onFocus={(e) => e.target.select()}
        />
      </label>

      <div className="mt-3">
        <span className="text-sm text-slate-500">All-correct bonus (rolled once, only on a perfect session)</span>
        <div className="mt-1.5">
          <PoolEditor pool={bonusPool} onChange={setBonusPool} prizes={prizes} />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving || bonusPool.length === 0}
        className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save payout'}
      </button>
      {saved && !saving && <span className="ml-2 text-xs text-green-600">Saved</span>}
    </div>
  );
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

  if (rows === null) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-400">No kids on the family yet.</p>;

  return (
    <div>
      <p className="text-xs text-slate-400">
        Grade level per kid, per subject - drives which questions they get. Defaults from birthday until you set one; a kid moving up a
        grade mid-year is your call, not automatic.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.userId} className="rounded-lg border bg-white p-3">
            <p className="font-medium">{members.find((m) => m.id === r.userId)?.displayName ?? r.displayName}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EDU_SUBJECTS.map((s) => (
                <div key={s} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5">
                  <span className="text-sm text-slate-500">
                    {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
                  </span>
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
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Adult: per-kid progress, wrong questions, session history ----------------
// Casey's own request - see mastery/wrong-question detail per kid without
// having to watch them play. One accordion row per kid, fetched lazily on
// open (bank-size + progress queries per subject aren't free, no reason to
// run them for every kid up front).

function KidProgress({ members }: { members: Member[] }) {
  const kids = members.filter((m) => m.role === 'KID');
  const [openId, setOpenId] = useState<string | null>(null);

  if (kids.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="font-semibold">Kid progress</h3>
      <p className="text-xs text-slate-400">Per-subject mastery, questions they're currently getting wrong, and recent sessions.</p>
      <div className="mt-3 flex flex-col gap-2">
        {kids.map((k) => (
          <div key={k.id} className="rounded border">
            <button
              onClick={() => setOpenId(openId === k.id ? null : k.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
            >
              <span>{k.displayName}</span>
              <span className="text-slate-400">{openId === k.id ? '▲' : '▼'}</span>
            </button>
            {openId === k.id && (
              <div className="border-t p-3">
                <LearningProgressLoader userId={k.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Adult: preview/test every recess break game ----------------
// Casey's own request - reviewing 20 games by playing blind through real kid
// sessions doesn't scale. Lets an adult jump straight to any one of them, at
// any grade (overriding that game's real minGrade gate - this is a review
// tool, not the real picker), so both interaction modes are reachable:
// dragOrTap.ts switches to drag at grade 2+, tap-to-tap below that.

function BreakGamePreview() {
  const [grade, setGrade] = useState(2);
  const [playing, setPlaying] = useState<{ subject: EduSubject; index: number } | null>(null);

  if (playing) {
    const entry = BREAK_GAMES[playing.subject][playing.index];
    const Game = entry.Component;
    return (
      <div className="rounded-lg border bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">
            {entry.label} <span className="text-xs font-normal text-slate-400">- previewing as {GRADE_LABELS[grade]} grade</span>
          </p>
          <button onClick={() => setPlaying(null)} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            ✕ Close
          </button>
        </div>
        <Game grade={grade} onDone={() => setPlaying(null)} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Break game preview</h3>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Preview as
          <select
            className="rounded border px-2 py-1 text-sm"
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
          >
            {GRADE_LABELS.map((label, g) => (
              <option key={g} value={g}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Play any recess break exactly as a kid would see it - grade 2 and up drags, below that is tap-to-tap.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {EDU_SUBJECTS.map((s) => (
          <div key={s}>
            <p className="text-sm font-medium text-slate-500">
              {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
            </p>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {BREAK_GAMES[s].map((g, i) => (
                <button
                  key={g.label}
                  onClick={() => setPlaying({ subject: s, index: i })}
                  className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span>{g.label}</span>
                  <span className="text-xs text-slate-400">Grade {GRADE_LABELS[g.minGrade]}+ &nbsp;▶ Play</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Kid: pick a subject, play a session ----------------

type Phase = 'PICK_SUBJECT' | 'STARTING' | 'QUESTION' | 'FEEDBACK' | 'BREAK' | 'DONE';

// Reused as-is by the kiosk (Display.tsx): kioskToken swaps every API call
// from the cookie session to the kiosk-token one, initialSubject skips
// straight past the picker screen (the kiosk's own "which subject" tap
// already happened, in its own panel next to Games - see that file), and
// onExit gives the DONE screen a real "close" action when embedded in a
// modal instead of only the modal's own backdrop/X.
export function PlaySession({
  tokenIcon,
  myUserId,
  kioskToken,
  initialSubject,
  onExit,
}: {
  tokenIcon: string;
  myUserId?: string;
  kioskToken?: string;
  initialSubject?: EduSubject;
  onExit?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('PICK_SUBJECT');
  const [session, setSession] = useState<EduSessionStart | null>(null);
  // Picked once at the moment the break starts (not re-picked on every
  // re-render) - a plain lookup in the render body would re-randomize the
  // game out from under the kid mid-break. lastBreakGameRef avoids handing
  // back the exact same concept twice in a row for one subject.
  const [currentBreakGame, setCurrentBreakGame] = useState<BreakGameEntry['Component'] | null>(null);
  const lastBreakGameRef = useRef<BreakGameEntry['Component'] | null>(null);
  const [questions, setQuestions] = useState<EduQuestionForPlay[]>([]);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState('');
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [summary, setSummary] = useState<{ allCorrect: boolean; bonusTokens: number; promotedTo: number | null } | null>(null);
  // Set when a subject has no question bank yet for this kid's grade
  // (Reading/Science/Spelling as of PLANNING.md §19's first build - only
  // Math has content). Without this, starting one of them failed silently:
  // the button click just... did nothing, no error, no explanation. Caught
  // live in a browser check, not by tsc.
  const [startError, setStartError] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  // Casey's own instruction: once a session is actually in play, the only
  // way out is the X, and the X asks first - no accidental backdrop-tap or
  // stray click losing progress on a set that isn't saved until DONE (see
  // answer()'s own comment on why). Same component, same rule, on the app
  // and the kiosk - only the kiosk happens to embed this in a Modal at all.
  const [confirmQuit, setConfirmQuit] = useState(false);

  function quit() {
    setConfirmQuit(false);
    if (onExit) onExit();
    else {
      setSession(null);
      setQuestions([]);
      setSummary(null);
      setPhase('PICK_SUBJECT');
    }
  }

  const quitButton = (
    <button
      onClick={() => setConfirmQuit(true)}
      aria-label="Quit session"
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
    >
      ✕
    </button>
  );

  const confirmQuitModal = confirmQuit && (
    <Modal
      maxWidthClass="max-w-sm"
      onBackdropClick={() => setConfirmQuit(false)}
      header={<h3 className="text-lg font-semibold">Quit this session?</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirmQuit(false)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            Keep playing
          </button>
          <button onClick={quit} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
            Quit
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-500">You'll lose your progress on this set of questions - it isn't saved until you finish.</p>
    </Modal>
  );

  async function start(subject: EduSubject) {
    setPhase('STARTING');
    setStartError(null);
    try {
      const s = await api.startLearningSession(subject, kioskToken);
      setSession(s);
      setQuestions(s.questions);
      setIndex(0);
      setSessionTokens(0);
      setPhase('QUESTION');
    } catch {
      setStartError(`${SUBJECT_META[subject].label} isn't ready to play yet - ask an adult, or try Math.`);
      setPhase('PICK_SUBJECT');
    }
  }

  // Kiosk entry: the subject was already picked in the Learning panel
  // before this component even mounted - go straight in, no picker screen.
  useEffect(() => {
    if (initialSubject) start(initialSubject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!session || !given.trim()) return;
    const q = questions[index];
    const result = await api.answerLearningQuestion(session.sessionId, q.id, given.trim(), kioskToken);
    setFeedback({ correct: result.correct, correctAnswer: result.correctAnswer });
    setSessionTokens((t) => t + result.tokensAwarded);
    setPhase('FEEDBACK');
    if (result.phase === 'DONE') {
      setSummary({ allCorrect: !!result.allCorrect, bonusTokens: result.bonusTokens ?? 0, promotedTo: result.promotedTo ?? null });
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
    if (session) {
      const picked = pickBreakGame(session.subject, session.grade, lastBreakGameRef.current);
      // setState treats a bare function argument as a functional updater
      // (calls it with prevState instead of storing it) - picked IS a
      // function (the component itself), so it must go in wrapped, or
      // React invokes e.g. SpeedMatch(prevState) during the next render's
      // useState call. That's the "Cannot destructure property 'grade' of
      // null" crash: SpeedMatch(null) trying to destructure its props.
      setCurrentBreakGame(() => picked);
    }
    setPhase('BREAK');
  }

  async function afterBreak() {
    if (!session) return;
    lastBreakGameRef.current = currentBreakGame;
    const nextBlock = await api.advanceLearningSession(session.sessionId, kioskToken);
    setQuestions(nextBlock.questions);
    setIndex(0);
    setPhase('QUESTION');
  }

  function playAgain() {
    setSession(null);
    setQuestions([]);
    setSummary(null);
    // Kiosk entry has no picker screen to fall back to - go straight into
    // another round of the same subject instead of stranding it on a
    // PICK_SUBJECT screen it never showed in the first place.
    if (initialSubject) start(initialSubject);
    else setPhase('PICK_SUBJECT');
  }

  if (phase === 'PICK_SUBJECT' || phase === 'STARTING') {
    return (
      <div className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-500">
            Pick a subject to play - 5 questions, a quick break, 5 more. Tokens for every correct answer, paid out when you finish -
            quitting early earns nothing, so see it through!
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {myUserId && (
              <button
                onClick={() => setShowProgress(true)}
                className="whitespace-nowrap rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                📊 My Progress
              </button>
            )}
            {/* Plain close, no confirm - nothing's in progress yet to lose. */}
            {onExit && (
              <button onClick={onExit} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                ✕
              </button>
            )}
          </div>
        </div>
        {startError && <p className="mt-2 text-sm text-red-500">{startError}</p>}
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
        {showProgress && myUserId && (
          <Modal
            maxWidthClass="max-w-2xl"
            onBackdropClick={() => setShowProgress(false)}
            header={<h3 className="text-lg font-semibold">My progress</h3>}
          >
            <LearningProgressLoader userId={myUserId} kioskToken={kioskToken} />
          </Modal>
        )}
      </div>
    );
  }

  if (phase === 'BREAK' && session && currentBreakGame) {
    const BreakGame = currentBreakGame;
    return (
      <div className="mt-4">
        <div className="mb-1 flex justify-end">{quitButton}</div>
        <BreakGame grade={session.grade} onDone={afterBreak} />
        {confirmQuitModal}
      </div>
    );
  }

  if (phase === 'DONE' && summary) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border bg-white p-8 text-center">
        <div className="text-2xl font-bold">{summary.allCorrect ? '🌟 Perfect session!' : 'Session complete!'}</div>
        <TokenBadge icon={tokenIcon} amount={sessionTokens} label="earned" size="lg" />
        {summary.allCorrect && summary.bonusTokens > 0 && (
          <p className="text-sm text-amber-600 flex items-center gap-1">
            Got every question right - <TokenBadge icon={tokenIcon} amount={`+${summary.bonusTokens}`} label="bonus" />
          </p>
        )}
        {summary.promotedTo !== null && (
          <p className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            🎉 Leveled up to {GRADE_LABELS[summary.promotedTo]} grade!
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            onClick={(e) => {
              celebrate(e.currentTarget, 'choreCompleted');
              playAgain();
            }}
            className="rounded-lg bg-slate-800 px-5 py-2 font-semibold text-white hover:bg-slate-700"
          >
            Play again
          </button>
          {onExit && (
            <button onClick={onExit} className="rounded-lg border px-5 py-2 font-semibold text-slate-600 hover:bg-slate-50">
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = questions[index];
  if (!q) return null;

  return (
    <div className="mt-4 flex flex-col items-center gap-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-2">
            <TokenBadge icon={tokenIcon} amount={sessionTokens} label="so far" />
            {quitButton}
          </div>
        </div>
        <QuestionVisual visual={q.visual} />
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
      {confirmQuitModal}
    </div>
  );
}
