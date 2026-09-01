import type { ReactNode } from 'react';

// Shared modal shell: header and footer never scroll, only the body between
// them does - so the title and Cancel/Submit row stay on screen no matter
// how tall the content gets (long forms, lists, small phones with the
// keyboard open). max-h caps the card itself; the body is what gives.
export default function Modal({
  header,
  footer,
  children,
  maxWidthClass = 'max-w-md',
  className = '',
  onBackdropClick,
  onClose,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  className?: string;
  // Tapping outside the card - fine for a view-only modal, risky for a form
  // (silently drops whatever was being typed), so callers opt in per modal
  // rather than getting it for free.
  onBackdropClick?: () => void;
  // The header's own ✕ button - every modal gets one now, regardless of
  // whether backdrop-dismiss is also wired up. Falls back to
  // `onBackdropClick` so the many call sites that already pass that (and
  // want the same handler for both) don't need a second, identical prop.
  onClose?: () => void;
}) {
  const close = onClose ?? onBackdropClick;
  return (
    // z-50 puts the dialog above the fixed bottom tab bar (z-40) - without it
    // the tab bar painted over the footer and swallowed the submit button.
    // The extra bottom padding on phones keeps the card itself clear of the
    // bar rather than just layering on top of it.
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[calc(1rem+3.75rem+env(safe-area-inset-bottom))] lg:pb-4 ${className}`}
      onClick={onBackdropClick}
    >
      <div
        className={`modal-card flex max-h-[85vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-lg bg-white`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Every modal gets an explicit X, not just a backdrop click - a
            modal with content taller than the viewport (or opened on a
            touchscreen kiosk with no obvious "click outside" affordance)
            had no way to close at all otherwise. Rendered whenever there's
            a close handler to call, even if `header` itself is empty, so
            the X still shows up top-right on its own. */}
        {(header || close) && (
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">{header}</div>
            {close && (
              <button
                onClick={close}
                aria-label="Close"
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-5 ${header || close ? '' : 'pt-5'}`}>{children}</div>
        {footer && <div className="shrink-0 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
