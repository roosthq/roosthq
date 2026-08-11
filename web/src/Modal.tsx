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
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  className?: string;
  onBackdropClick?: () => void;
}) {
  return (
    // z-50 puts the dialog above the fixed bottom tab bar (z-40) - without it
    // the tab bar painted over the footer and swallowed the submit button.
    // The extra bottom padding on phones keeps the card itself clear of the
    // bar rather than just layering on top of it.
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[calc(1rem+3.6rem+env(safe-area-inset-bottom))] lg:pb-4 ${className}`}
      onClick={onBackdropClick}
    >
      <div
        className={`modal-card flex max-h-[85vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-lg bg-white`}
        onClick={(e) => e.stopPropagation()}
      >
        {header && <div className="shrink-0 px-5 pt-5 pb-3">{header}</div>}
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-5 ${header ? '' : 'pt-5'}`}>{children}</div>
        {footer && <div className="shrink-0 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
