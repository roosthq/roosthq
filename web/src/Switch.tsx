// A real switch (role="switch", keyboard-operable, visible focus ring) - not
// a styled checkbox. Every on/off toggle in the Features tab uses this,
// top-level and sub-feature alike. bg-slate-800/bg-slate-300 ride the
// existing theme bridge (index.css) automatically, same as every other
// solid/outline control in the app - no new color tokens needed.
export default function Switch({
  checked,
  onChange,
  disabled,
  label,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'md' | 'sm';
}) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-10';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const travel = size === 'sm' ? 'translate-x-4' : 'translate-x-4';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${track} ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      } ${checked ? 'bg-slate-800' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 rounded-full bg-white shadow transition-transform ${knob} ${checked ? travel : 'translate-x-0'}`}
      />
    </button>
  );
}
