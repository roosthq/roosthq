import type { EduQuestionVisual } from './api';

// Word-problem illustrations for Learning Games (PLANNING.md §19) - hand-
// drawn flat-vector SVG icons, not emoji and not the site's icon-
// substitution system (Casey's own feedback: question content should look
// like real graphics, not plain text everywhere). Four icons is a small
// deliberate start - more items are additive later, same as everything
// else in this feature.

function AppleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M15 9c0 -2 1.5 -3.5 3 -4" stroke="#5a8f3c" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M16 10c-6.5 0 -10 5 -10 10.5C6 26 10 29 16 29s10 -3 10 -8.5C26 15 22.5 10 16 10z" fill="#e5484d" />
      <ellipse cx="12" cy="17" rx="2.2" ry="3.2" fill="#fff" opacity="0.25" />
    </svg>
  );
}
function StarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path
        d="M16 3l3.5 8.2 8.9 0.8-6.7 5.9 2 8.7L16 22.6 8.3 26.6l2-8.7-6.7-5.9 8.9-0.8z"
        fill="#f2c14e"
        stroke="#d9a531"
        strokeWidth="1"
      />
    </svg>
  );
}
function CookieIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="#c98a4b" />
      <circle cx="16" cy="16" r="12" fill="none" stroke="#a86a34" strokeWidth="1" />
      <circle cx="11" cy="12" r="1.6" fill="#5c3a1e" />
      <circle cx="19" cy="11" r="1.6" fill="#5c3a1e" />
      <circle cx="21" cy="18" r="1.6" fill="#5c3a1e" />
      <circle cx="13" cy="20" r="1.6" fill="#5c3a1e" />
      <circle cx="17" cy="17" r="1.6" fill="#5c3a1e" />
    </svg>
  );
}
function BalloonIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 36">
      <path d="M16 2c-6 0-9 5-9 10s3.5 10 9 10 9-5.5 9-10-3-10-9-10z" fill="#5b8def" />
      <ellipse cx="13" cy="10" rx="2" ry="3" fill="#fff" opacity="0.25" />
      <path d="M16 22l-1.5 3 1.5 1 1.5-1z" fill="#5b8def" />
      <path d="M16 26v8" stroke="#8a8f98" strokeWidth="1" fill="none" />
    </svg>
  );
}

const ICONS = { apple: AppleIcon, star: StarIcon, cookie: CookieIcon, balloon: BalloonIcon };

function IconGroup({ item, n, size = 36 }: { item: keyof typeof ICONS; n: number; size?: number }) {
  const Icon = ICONS[item];
  const count = Math.max(1, Math.min(12, n));
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {Array.from({ length: count }, (_, i) => (
        <Icon key={i} size={size} />
      ))}
    </div>
  );
}

export default function QuestionVisual({ visual }: { visual: EduQuestionVisual | null | undefined }) {
  if (!visual) return null;
  if (visual.kind === 'count') {
    return (
      <div className="mb-3 rounded-lg bg-slate-50 p-3">
        <IconGroup item={visual.item} n={visual.n} />
      </div>
    );
  }
  if (visual.kind === 'combine') {
    return (
      <div className="mb-3 flex items-center justify-center gap-3 rounded-lg bg-slate-50 p-3">
        <IconGroup item={visual.item} n={visual.a} size={30} />
        <span className="text-2xl font-bold text-slate-400">+</span>
        <IconGroup item={visual.item} n={visual.b} size={30} />
      </div>
    );
  }
  return null;
}
