import { useEffect, useRef, useState } from 'react';

// Shared interaction engine for the 4 break-game concepts that need a real
// pick-up-and-place action (Balance Builder, Story Order Swap, Habitat Sort,
// Scramble Swap - see PLANNING.md §19 "Recess Concepts"). Real research
// (kids' app UX literature, not a guess): kids under ~5 can't reliably hold
// contact through a drag - the industry-standard fallback is "tap-to-tap"
// (tap the thing, then tap where it goes), not banning drag outright. So:
// grade 2+ gets a real pointer-drag, K-1 gets tap-to-tap, same game either
// way. This is also the direct fix for HabitatBuilder's old bug - that game
// combined drag WITH a falling timer; the drag itself was never the
// problem, the "chase a moving target while also dragging it" was.

export type DragMode = 'drag' | 'tap';

export function modeForGrade(grade: number): DragMode {
  return grade >= 2 ? 'drag' : 'tap';
}

// ---------------- Asymmetric: distinct item set + distinct target set ----------------
// (Habitat Sort: animals -> habitats. Balance Builder: number tiles -> the scale.)
// Items and targets are different elements, so their handlers never collide -
// no shared-state ambiguity to resolve.

interface AsymmetricOptions {
  mode: DragMode;
  onCommit: (itemId: string, targetId: string) => void;
}

export function useDragOrTapAsymmetric({ mode, onCommit }: AsymmetricOptions) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number; originX: number; originY: number } | null>(null);
  const [overTarget, setOverTarget] = useState<string | null>(null);
  const targetRefs = useRef<Record<string, Element | null>>({});
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  function hitTest(x: number, y: number): string | null {
    for (const [targetId, el] of Object.entries(targetRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return targetId;
    }
    return null;
  }

  useEffect(() => {
    if (mode !== 'drag') return;
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      setDragging((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      setOverTarget(hitTest(e.clientX, e.clientY));
    }
    function onUp(e: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;
      const target = hitTest(e.clientX, e.clientY);
      if (target) onCommit(d.id, target);
      setDragging(null);
      setOverTarget(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function itemProps(id: string) {
    if (mode === 'tap') {
      return {
        onClick: () => setSelected((s) => (s === id ? null : id)),
        'data-selected': selected === id ? 'true' : undefined,
      };
    }
    return {
      onPointerDown: (e: React.PointerEvent) => {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        setDragging({ id, x: e.clientX, y: e.clientY, originX: e.clientX, originY: e.clientY });
      },
      'data-dragging': dragging?.id === id ? 'true' : undefined,
    };
  }

  function targetProps(id: string) {
    return {
      ref: (el: Element | null) => {
        targetRefs.current[id] = el;
      },
      ...(mode === 'tap'
        ? {
            onClick: () => {
              if (selected) {
                onCommit(selected, id);
                setSelected(null);
              }
            },
          }
        : {}),
      'data-hover': overTarget === id ? 'true' : undefined,
    };
  }

  return { itemProps, targetProps, dragging, selected };
}

// ---------------- Symmetric: one set of tiles, swap any two ----------------
// (Story Order Swap, Scramble Swap.) Every tile is both pickable and
// droppable, so a single handler resolves "is this a pick or a commit"
// instead of two handlers racing on the same element.

interface SwapOptions {
  mode: DragMode;
  onSwap: (aId: string, bId: string) => void;
}

export function useDragOrTapSwap({ mode, onSwap }: SwapOptions) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
  const [overTile, setOverTile] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, Element | null>>({});
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  function hitTest(x: number, y: number): string | null {
    for (const [tileId, el] of Object.entries(tileRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return tileId;
    }
    return null;
  }

  useEffect(() => {
    if (mode !== 'drag') return;
    function onMove(e: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;
      setDragging({ ...d, x: e.clientX, y: e.clientY });
      const hit = hitTest(e.clientX, e.clientY);
      setOverTile(hit && hit !== d.id ? hit : null);
    }
    function onUp(e: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (hit && hit !== d.id) onSwap(d.id, hit);
      setDragging(null);
      setOverTile(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function tileProps(id: string) {
    const ref = (el: Element | null) => {
      tileRefs.current[id] = el;
    };
    if (mode === 'tap') {
      return {
        ref,
        onClick: () => {
          if (selected === null) {
            setSelected(id);
          } else if (selected === id) {
            setSelected(null);
          } else {
            onSwap(selected, id);
            setSelected(null);
          }
        },
        'data-selected': selected === id ? 'true' : undefined,
      };
    }
    return {
      ref,
      onPointerDown: (e: React.PointerEvent) => {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        setDragging({ id, x: e.clientX, y: e.clientY });
      },
      'data-dragging': dragging?.id === id ? 'true' : undefined,
      'data-hover': overTile === id ? 'true' : undefined,
    };
  }

  return { tileProps, dragging, selected };
}
