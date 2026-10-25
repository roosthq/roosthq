import { useEffect, useRef, useState } from 'react';
import type { EduQuestionMedia } from './api';

// Photo and sound for a Learning question. Files live under web/public/learning
// (credits in CREDITS.md there) and are referenced by site-relative path, so
// they resolve the same on the app and the kiosk.
export const mediaSrc = (p: string) => `/${p.replace(/^\/+/, '')}`;
const src = mediaSrc;

// Every question picture is a 4:3 landscape (800 x 600 stored), shown in a box
// of exactly that shape, so what an owner uploads is what the kid sees - nothing
// stretched, nothing pushing the layout around. See the in-app media guide.
export function QuestionPhoto({ media }: { media: EduQuestionMedia | null | undefined }) {
  if (!media?.image) return null;
  return (
    <div className="mx-auto mb-3 aspect-[4/3] w-full max-w-xs overflow-hidden rounded-lg border bg-slate-100">
      <img src={src(media.image)} alt={media.alt ?? ''} loading="eager" className="h-full w-full object-cover" />
    </div>
  );
}

// A big, obvious "hear it" button; tries to play once on mount (works when the
// kid's tap that started the question counts as the gesture, silently skipped
// by the browser otherwise) and can always be replayed.
export function QuestionAudio({
  media,
  autoPlayKey,
  noAutoPlay,
}: {
  media: EduQuestionMedia | null | undefined;
  autoPlayKey: string;
  // The editor's preview must never blast sound just because it re-rendered.
  noAutoPlay?: boolean;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(false);
    const a = ref.current;
    if (!a || !media?.audio || noAutoPlay) return;
    a.currentTime = 0;
    a.play().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayKey]);
  if (!media?.audio) return null;
  return (
    <div className="mb-3 flex justify-center">
      <audio ref={ref} src={src(media.audio)} preload="auto" onPlay={() => setPlaying(true)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />
      <button
        type="button"
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          a.currentTime = 0;
          a.play().catch(() => undefined);
        }}
        className="flex items-center gap-2 rounded-full px-6 py-3 text-lg font-bold text-white shadow"
        style={{ background: 'var(--accent)' }}
        aria-label="Play the sound"
      >
        <span aria-hidden>{playing ? '🔊' : '🔈'}</span> {playing ? 'Listening...' : 'Hear it'}
      </button>
    </div>
  );
}

// IMAGE_CHOICE: pick the picture. `choices` are short labels ("A", "B", ...)
// shown as a badge on each photo.
export function ImageChoices({
  choices,
  media,
  given,
  onPick,
  correct,
}: {
  choices: string[];
  media: EduQuestionMedia | null | undefined;
  given: string;
  onPick: (c: string) => void;
  // Set after answering: the right letter is ringed green, the rest dimmed,
  // and the pictures stop taking taps.
  correct?: string;
}) {
  const imgs = media?.choiceImages ?? [];
  return (
    <div className="grid grid-cols-2 gap-3">
      {choices.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => !correct && onPick(c)}
          disabled={!!correct}
          className={`relative overflow-hidden rounded-xl border-2 ${
            correct
              ? c === correct
                ? 'border-green-600 ring-2 ring-green-600'
                : given === c
                  ? 'border-red-400 opacity-60'
                  : 'border-transparent opacity-40'
              : given === c
                ? 'border-slate-800 ring-2 ring-slate-800'
                : 'border-transparent hover:border-slate-300'
          }`}
          aria-label={media?.choiceAlts?.[i] ?? `Picture ${c}`}
        >
          {imgs[i] && <img src={src(imgs[i])} alt={media?.choiceAlts?.[i] ?? ''} className="aspect-[4/3] w-full object-cover" />}
          <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2.5 py-0.5 text-sm font-extrabold text-slate-800 shadow">{c}</span>
        </button>
      ))}
    </div>
  );
}
