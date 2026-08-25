import { useState, type ReactNode } from 'react';
import DropdownDetails from './DropdownDetails';
import BottomSheet from './BottomSheet';
import useNarrowViewport from './useNarrowViewport';

// The app-wide version of the fix PendingIndicator got first: a
// DropdownDetails popover is anchored (absolute left-0/right-0) to its OWN
// trigger element, not to the viewport - on a phone, any trigger that isn't
// flush against the true screen edge can push a wide-enough panel off
// whichever side has less room. Several call sites had already grown their
// own one-off workarounds for this exact symptom (GhostQuickSwitcher's
// `align` prop, Nav's nameMenu switching left-0/right-0 by where it's
// mounted, EatOutPlacesPanel's `max-w-[calc(100vw-2rem)]` clamp) - this
// replaces all of them with one real fix instead of one guess per instance.
//
// Below the sm breakpoint, the trigger opens a BottomSheet (viewport-
// anchored, can't run off an edge) instead of the popover; at sm and above,
// it's the exact same DropdownDetails popover every call site used before.
//
// `children` may be a function `(close) => node` when content needs to
// close itself after an action (e.g. a nav link) - `close()` is a no-op on
// the desktop popover (nothing needs it there; the native <details> was
// never the thing running off-screen) and actually closes the sheet on
// mobile.
export default function ResponsiveDropdown({
  trigger,
  triggerClassName,
  title,
  align = 'right',
  panelClassName = 'w-64',
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  // Sheet header on mobile - the desktop popover has no title chrome of its
  // own (matches every existing DropdownDetails call site), so this is
  // mobile-only.
  title: string;
  align?: 'left' | 'right';
  panelClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const narrow = useNarrowViewport();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const content = typeof children === 'function' ? children(close) : children;

  if (narrow) {
    return (
      <>
        <button onClick={() => setOpen(true)} className={triggerClassName}>
          {trigger}
        </button>
        <BottomSheet open={open} onClose={close} title={title}>
          {content}
        </BottomSheet>
      </>
    );
  }

  return (
    <DropdownDetails summary={trigger} summaryClassName={triggerClassName}>
      <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-20 mt-1 ${panelClassName} rounded border bg-white p-2 shadow`}>
        {content}
      </div>
    </DropdownDetails>
  );
}
