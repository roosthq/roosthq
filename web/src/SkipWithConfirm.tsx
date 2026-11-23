import { useState } from 'react';

// A deliberate "skip" for things a child can lose for good (the Redemption
// Round bonus question). One stray tap next to the answer buttons used to throw
// the question away with no way back; this takes two taps, and the second one
// sits in a different spot from where the first tap landed, so it cannot be
// hit by a finger that is still on its way to an answer.
//
// The quiet link is the only thing shown until it is tapped. Then it turns into
// a small box that says what skipping costs, with "Keep trying" as the big,
// easy target and "Yes, skip it" as the small one.
export default function SkipWithConfirm({
  label,
  warning,
  confirmLabel = 'Yes, skip it',
  keepLabel = 'Keep trying',
  onConfirm,
  onKeep,
  disabled,
}: {
  label: string;
  warning: string;
  confirmLabel?: string;
  keepLabel?: string;
  onConfirm: () => void;
  /** What the big button does besides closing this box (default: just closes it). */
  onKeep?: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <div className="mt-8 border-t pt-4 text-center">
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={disabled}
          className="rounded px-3 py-1.5 text-xs font-medium text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-center" role="alertdialog" aria-label={label}>
      <p className="text-sm font-medium text-slate-700">{warning}</p>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onKeep?.();
        }}
        className="mt-3 w-full rounded-lg bg-amber-500 py-3 text-base font-semibold text-white hover:bg-amber-400"
        autoFocus
      >
        {keepLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="mt-6 rounded px-3 py-1.5 text-xs font-medium text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
