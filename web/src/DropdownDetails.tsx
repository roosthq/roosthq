import { useEffect, useRef, type ReactNode } from 'react';

// Native <details>/<summary> makes a decent zero-JS dropdown shell (the
// summary toggles it, no open/close state to manage) — except it has no
// built-in "close when you click anywhere else", so it just stays open
// forever until the summary is clicked again. This wraps it with exactly
// that one missing behavior; everything else about <details> is untouched.
export default function DropdownDetails({
  summary,
  summaryClassName = 'cursor-pointer list-none text-slate-500 hover:text-slate-800',
  className = 'relative',
  children,
}: {
  summary: ReactNode;
  summaryClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (el && el.open && !el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <details ref={ref} className={className}>
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  );
}
