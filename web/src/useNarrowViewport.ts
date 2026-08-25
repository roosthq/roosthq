import { useEffect, useState } from 'react';

// Shared "is this a phone-width screen" signal - same 640px cut as Tailwind's
// own `sm` breakpoint, so anything gated on this lines up with anything
// gated on `sm:` classes elsewhere. Originally inlined once in Calendar.tsx
// (the grid-vs-vertical-week switch); pulled out because the mobile redesign
// needs the same signal in more than one place now (bottom sheets vs.
// anchored popovers) and duplicating a matchMedia listener per component
// invites them drifting out of sync.
export default function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639.98px)');
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
