import { useEffect, type ReactNode } from 'react';

// Mobile redesign, phase 1 (2026-08): the fix for "the pending popover ran
// off the edge of my phone" isn't a bigger or better-positioned popover -
// it's not a popover at all. DropdownDetails/Modal-style absolute
// positioning is anchored to its trigger element; on a narrow screen, any
// trigger that isn't flush against the true screen edge (the header's
// hourglass icon sits mid-row, not at x=0 or x=viewport-width) can push a
// wide panel off whichever side has less room. A bottom sheet has no
// trigger-relative anchor at all - `fixed inset-0` + `items-end` ties it to
// the VIEWPORT itself, so it structurally cannot run off an edge the way an
// anchored popover can.
//
// Meant for narrow/phone use (see useNarrowViewport) - callers keep their
// existing anchored-popover render path on wider screens, where there's
// always been room and this was never actually broken.
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Background page scroll fights the sheet's own internal scroll on a
  // touchscreen (the page behind it can still pan) - lock it while open,
  // same as Modal's fixed-overlay approach already implies for a dialog
  // but a sheet's own list area needs an explicit lock since it's not the
  // only scrollable thing on screen anymore.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="sheet-panel flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-slate-300" />
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2 pb-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
