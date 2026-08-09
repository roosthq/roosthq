import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Shared swipe-to-page recognizer for any week-at-a-time grid (dinner plan,
// and anything else that pages by a fixed unit) — same threshold-based
// approach as Calendar.tsx's day-grid swipe (mouse drags work the same as a
// real touchscreen; both just fire pointerdown/up). Returns the props to
// spread onto the swipeable container plus the two bits needed to drive the
// existing .cal-slide-next/.cal-slide-prev page-turn animation.
export function useWeekSwipe(onNavigate: (delta: 1 | -1) => void) {
  const [animDir, setAnimDir] = useState<1 | -1>(1);
  const [animKey, setAnimKey] = useState(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 45;

  function navigate(delta: 1 | -1) {
    setAnimDir(delta);
    setAnimKey((k) => k + 1);
    onNavigate(delta);
  }

  function onPointerDown(e: ReactPointerEvent) {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: ReactPointerEvent) {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > SWIPE_THRESHOLD) navigate(dx < 0 ? 1 : -1);
  }

  return {
    navigate,
    animKey,
    animClass: animDir === 1 ? 'cal-slide-next' : 'cal-slide-prev',
    swipeProps: {
      onPointerDown,
      onPointerUp,
      onPointerCancel: () => {
        swipeRef.current = null;
      },
      // Horizontal-only recognizer, so keep vertical page scroll working —
      // same reasoning as Calendar.tsx's month view (see there for why this
      // has to exclude the axis being recognized or a real touchscreen
      // fires pointercancel before pointerup ever runs).
      style: { touchAction: 'pan-y' as const },
    },
  };
}
