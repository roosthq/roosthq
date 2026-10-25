import { useEffect, useState } from 'react';
import { api, EDU_SUBJECTS, type EduSticker, type EduStickerBook, type EduSubject } from './api';
import { GRADE_LABELS, SUBJECT_META } from './LearningProgress';
import MonsterArt, { MonsterSticker, monsterFor } from './MonsterArt';

// A kid's sticker collection: one die-cut sticker per monster they have
// unlocked, in a book with a slot for every monster they still can. Empty
// slots stay mystery eggs - no names, no art - until the monster is earned.

function useStickerBook(userId: string, kioskToken: string | undefined, refreshKey?: unknown) {
  const [book, setBook] = useState<EduStickerBook | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api
      .learningStickers(userId, kioskToken)
      .then((b) => alive && setBook(b))
      .catch(() => alive && setBook(null));
    return () => {
      alive = false;
    };
  }, [userId, kioskToken, refreshKey]);
  return book;
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function StickerBookView({ book }: { book: EduStickerBook }) {
  const bySlot = new Map<string, EduSticker>(book.stickers.map((s) => [`${s.subject}:${s.grade}`, s]));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        <span className="font-semibold">{book.earned}</span> of {book.total} stickers collected. Hatch a monster to win its sticker!
      </p>
      {EDU_SUBJECTS.map((s) => {
        const slots = book.slots.filter((x) => x.subject === s);
        if (!slots.length) return null;
        const got = slots.filter((x) => bySlot.has(`${x.subject}:${x.grade}`)).length;
        return (
          <section key={s}>
            <h4 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <span>
                {SUBJECT_META[s].icon} {SUBJECT_META[s].label}
              </span>
              <span className="text-xs font-normal text-slate-400">
                {got} / {slots.length}
              </span>
              {got === slots.length && <span className="text-xs font-semibold text-amber-600">⭐ Set complete!</span>}
            </h4>
            <ul className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-7">
              {slots.map((x) => {
                const st = bySlot.get(`${x.subject}:${x.grade}`);
                return (
                  <li key={x.grade} className="flex flex-col items-center gap-1 text-center" title={st ? `Earned ${dateLabel(st.earnedAt)}` : 'Not unlocked yet'}>
                    {st ? (
                      <MonsterSticker subject={s} grade={x.grade} stage={2} size={64} />
                    ) : (
                      <span className="flex items-center justify-center rounded-full border-2 border-dashed border-slate-300" style={{ width: 64, height: 64 }}>
                        <MonsterArt subject={s} grade={x.grade} silhouette size={44} />
                      </span>
                    )}
                    <span className="text-[11px] font-semibold leading-tight">{st ? monsterFor(s, x.grade).name : '???'}</span>
                    <span className="text-[10px] text-slate-400">{GRADE_LABELS[x.grade]} grade</span>
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

export function StickerBookLoader({ userId, kioskToken }: { userId: string; kioskToken?: string }) {
  const book = useStickerBook(userId, kioskToken);
  if (book === undefined) return <p className="text-sm text-slate-400">Loading...</p>;
  if (book === null) return <p className="text-sm text-slate-500">Could not load the sticker book - try again in a moment.</p>;
  return <StickerBookView book={book} />;
}

// The profile-header shelf on the kiosk: newest stickers at a glance + the
// running count; tapping it opens the full book.
export function StickerShelf({ userId, kioskToken, refreshKey, onOpen }: { userId: string; kioskToken?: string; refreshKey?: unknown; onOpen: () => void }) {
  const book = useStickerBook(userId, kioskToken, refreshKey);
  if (!book || book.total === 0) return null;
  const recent = book.stickers.slice(0, 6);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-slate-50" aria-label="Open sticker book">
      <span className="flex min-w-0 flex-1 items-center -space-x-2">
        {recent.length ? (
          recent.map((s) => <MonsterSticker key={`${s.subject}${s.grade}`} subject={s.subject as EduSubject} grade={s.grade} stage={2} size={38} />)
        ) : (
          <span className="text-xs text-slate-400">No stickers yet - hatch a monster!</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold">
          🏷️ {book.earned}/{book.total}
        </span>
        <span className="block text-[10px] text-slate-400">Sticker book</span>
      </span>
    </button>
  );
}

// Tiny version for the tap-your-photo picker rows.
export function PickerStickers({ count, recent }: { count: number; recent: { subject: string; grade: number }[] }) {
  if (!count) return null;
  return (
    <span className="flex items-center gap-1" title={`${count} stickers`}>
      <span className="flex -space-x-1.5">
        {recent.map((s) => (
          <MonsterSticker key={`${s.subject}${s.grade}`} subject={s.subject as EduSubject} grade={s.grade} stage={2} size={20} />
        ))}
      </span>
      <span className="text-[10px] text-slate-400">{count}</span>
    </span>
  );
}
