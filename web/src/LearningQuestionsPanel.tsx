import { useEffect, useState } from 'react';
import { api, EDU_SUBJECTS, type EduSubject, type EduQuestionRow, type EduQuestionDetail, type EduQuestionInput } from './api';
import { SUBJECT_META, GRADE_LABELS } from './LearningProgress';
import { usePaginatedList } from './usePaginatedList';
import { useDialog } from './Dialog';
import Modal from './Modal';

// A crude but practical emoji check, mirroring LearningService's own
// EMOJI_RE exactly - only ever applied to a TEXT_INPUT answer (Casey's own
// rule: emoji are fine in a prompt or a multiple-choice option, never in
// something a kid has to type back verbatim). Client-side so a kid... no,
// an OWNER gets the mistake pointed out immediately instead of only after
// Save round-trips to the server and back.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}⭐❤️‍]/u;

const TYPE_LABEL: Record<'MULTIPLE_CHOICE' | 'TEXT_INPUT', string> = {
  MULTIPLE_CHOICE: 'Multiple choice',
  TEXT_INPUT: 'Written answer',
};

// Owner-only: the shared question bank behind Learning games, every subject
// and grade, all in one place (SettingsPage > Instance > Learning question
// bank). Deliberately NOT a page that dumps every question at once - that's
// thousands of rows across 4 subjects x 7 grades. A filtered, paginated,
// compact list instead; tap a row to open the real editor in a modal, same
// "select the thing, then edit it" shape every other admin list in this app
// already uses (Store's prize grid, PoolEditor's picker, etc).
export default function LearningQuestionsPanel() {
  const [subjectFilter, setSubjectFilter] = useState<EduSubject | ''>('');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'' | 'MULTIPLE_CHOICE' | 'TEXT_INPUT'>('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null | 'new'>(null);

  const { items, hasMore, loading, loadingMore, loadMore, reload } = usePaginatedList<EduQuestionRow>(
    (skip) =>
      api.listEduQuestions(
        { subject: subjectFilter || undefined, grade: gradeFilter ? Number(gradeFilter) : undefined, type: typeFilter || undefined, search, activeOnly },
        skip,
      ),
    [subjectFilter, gradeFilter, typeFilter, search, activeOnly],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Instance-wide, same as Holidays - every family plays from this one bank. Tap a question to edit it; anything a kid's
        already answered can be deactivated but not deleted, so their history stays intact.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Subject</span>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value as EduSubject | '')}
            className="mt-1 rounded border px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {EDU_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Grade</span>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="mt-1 rounded border px-2 py-1.5 text-sm">
            <option value="">All</option>
            {GRADE_LABELS.map((g, i) => (
              <option key={i} value={i}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Type</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="mt-1 rounded border px-2 py-1.5 text-sm">
            <option value="">All</option>
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="TEXT_INPUT">Written answer</option>
          </select>
        </label>
        <label className="min-w-0 flex-1 text-sm">
          <span className="block text-xs text-slate-500">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="mt-1 w-full min-w-0 rounded border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Active only
        </label>
        <button onClick={() => setEditingId('new')} className="ml-auto rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
          + Add question
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {items.map((q) => (
          <li key={q.id}>
            <button
              onClick={() => setEditingId(q.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50 ${q.active ? '' : 'opacity-50'}`}
            >
              <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}>
                {SUBJECT_META[q.subject].icon} {GRADE_LABELS[q.grade]}
              </span>
              <span className="min-w-0 flex-1 truncate">{q.prompt}</span>
              <span className="shrink-0 text-xs text-slate-400">{TYPE_LABEL[q.type]}</span>
              {q.isCustom && <span className="shrink-0 text-xs font-medium text-slate-400">yours</span>}
              {!q.active && <span className="shrink-0 text-xs font-medium text-slate-400">inactive</span>}
            </button>
          </li>
        ))}
        {!loading && items.length === 0 && <li className="text-sm text-slate-400">No questions match those filters.</li>}
        {loading && <li className="text-sm text-slate-400">Loading…</li>}
      </ul>
      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="w-full rounded border py-1.5 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50">
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}

      {editingId !== null && (
        <QuestionEditor
          id={editingId === 'new' ? null : editingId}
          defaultSubject={subjectFilter || 'MATH'}
          defaultGrade={gradeFilter ? Number(gradeFilter) : 0}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

const EMPTY_CHOICES = ['', ''];

function QuestionEditor({
  id,
  defaultSubject,
  defaultGrade,
  onClose,
  onSaved,
}: {
  id: string | null; // null = creating new
  defaultSubject: EduSubject;
  defaultGrade: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { confirm, alert } = useDialog();
  const [loaded, setLoaded] = useState<EduQuestionDetail | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [subject, setSubject] = useState<EduSubject>(defaultSubject);
  const [grade, setGrade] = useState(defaultGrade);
  const [type, setType] = useState<'MULTIPLE_CHOICE' | 'TEXT_INPUT'>('MULTIPLE_CHOICE');
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState<string[]>(EMPTY_CHOICES);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.getEduQuestion(id).then((q) => {
      if (!alive) return;
      setLoaded(q);
      setSubject(q.subject);
      setGrade(q.grade);
      setType(q.type);
      setPrompt(q.prompt);
      if (q.type === 'MULTIPLE_CHOICE') {
        const cs = q.choices ?? EMPTY_CHOICES;
        setChoices(cs);
        const idx = cs.findIndex((c) => c.trim().toLowerCase() === q.answer.trim().toLowerCase());
        setCorrectIdx(idx >= 0 ? idx : 0);
      } else {
        setAnswer(q.answer);
      }
      setActive(q.active);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const answeredByCount = loaded?.answeredByCount ?? 0;
  const isNew = id === null;

  function addChoice() {
    if (choices.length >= 6) return;
    setChoices([...choices, '']);
  }
  function removeChoice(i: number) {
    if (choices.length <= 2) return;
    const next = choices.filter((_, idx) => idx !== i);
    setChoices(next);
    if (correctIdx === i) setCorrectIdx(0);
    else if (correctIdx > i) setCorrectIdx(correctIdx - 1);
  }

  function onAnswerChange(v: string) {
    // Strip emoji as they're typed rather than just rejecting on Save - a
    // kid has to type this back exactly, so a written answer with emoji in
    // it would be unanswerable no matter how it got there.
    setAnswer(v.replace(new RegExp(EMOJI_RE, 'gu'), ''));
  }

  async function save() {
    setError(null);
    if (!prompt.trim()) return setError('Prompt is required');
    const dto: EduQuestionInput = {
      subject,
      grade,
      type,
      prompt: prompt.trim(),
      answer: type === 'MULTIPLE_CHOICE' ? choices[correctIdx] ?? '' : answer,
      choices: type === 'MULTIPLE_CHOICE' ? choices.map((c) => c.trim()).filter(Boolean) : undefined,
      active,
    };
    setBusy(true);
    try {
      if (isNew) await api.createEduQuestion(dto);
      else await api.updateEduQuestion(id!, dto);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!id) return;
    if (!(await confirm('Delete this question? This only works if no kid has ever answered it.', { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.deleteEduQuestion(id);
      onSaved();
    } catch (e) {
      await alert(e instanceof Error ? e.message : 'Could not delete that.');
    }
  }

  const input = 'mt-1 w-full min-w-0 rounded border px-2 py-1.5 text-sm';

  return (
    <Modal
      maxWidthClass="max-w-lg"
      onClose={onClose}
      header={<h3 className="text-lg font-semibold">{isNew ? 'Add question' : 'Edit question'}</h3>}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {!isNew && (
            <button onClick={del} className="btn-delete rounded px-3 py-1.5 text-sm">
              Delete
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={save} disabled={busy} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
              {isNew ? 'Add question' : 'Save changes'}
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {answeredByCount > 0 && (
            <p className="rounded border px-2.5 py-1.5 text-xs text-slate-500">
              {answeredByCount} kid{answeredByCount === 1 ? '' : 's'} already answered this - deleting is disabled, but you can still edit it or
              deactivate it.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Subject</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value as EduSubject)} className={input}>
                {EDU_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Grade</span>
              <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} className={input}>
                {GRADE_LABELS.map((g, i) => (
                  <option key={i} value={i}>
                    {g} grade
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-sm">
            <span className="block text-xs text-slate-500">Type</span>
            <div className="mt-1 flex rounded border p-0.5 text-sm">
              {(['MULTIPLE_CHOICE', 'TEXT_INPUT'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 rounded px-2 py-1.5 ${type === t ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </label>

          <label className="text-sm">
            <span className="block text-xs text-slate-500">Prompt - emoji welcome</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className={input} />
          </label>

          {type === 'MULTIPLE_CHOICE' ? (
            <div>
              <span className="block text-xs text-slate-500">Choices - pick the correct one, emoji welcome</span>
              <div className="mt-1 space-y-1.5">
                {choices.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctChoice"
                      checked={correctIdx === i}
                      onChange={() => setCorrectIdx(i)}
                      title="Correct answer"
                    />
                    <input
                      value={c}
                      onChange={(e) => setChoices(choices.map((x, idx) => (idx === i ? e.target.value : x)))}
                      className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeChoice(i)}
                      disabled={choices.length <= 2}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                      aria-label="Remove choice"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addChoice}
                disabled={choices.length >= 6}
                className="mt-1.5 rounded border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
              >
                + Add choice
              </button>
            </div>
          ) : (
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Written answer - no emoji, a kid has to type this back exactly</span>
              <input value={answer} onChange={(e) => onAnswerChange(e.target.value)} className={input} />
            </label>
          )}

          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active - shows up in play sessions
          </label>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
