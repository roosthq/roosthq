import type { ReactElement } from 'react';
import MiniGamePinTumbler, { MiniGamePinTumblerPreview, type MiniGamePlayReport } from './MiniGamePinTumbler';
import MiniGameWireSplice, { MiniGameWireSplicePreview } from './MiniGameWireSplice';
import type { MiniGameConfig } from './api';

// One shared registry for "which real component does this gameType have" -
// used by MiniGamePlayer's playing phase, MiniGamesTab's no-stakes
// PreviewModal, and the idle-preview dispatch below. A gameType with no
// entry here just hasn't been ported yet; every call site's own fallback
// (a placeholder message, or a static icon) covers that consistently.
export function playFor(gameType: string): ((props: { config: MiniGameConfig; onFinish: (report: MiniGamePlayReport) => void }) => ReactElement) | null {
  if (gameType === 'PIN_TUMBLER') return MiniGamePinTumbler;
  if (gameType === 'WIRE_SPLICE') return MiniGameWireSplice;
  return null;
}

// Which idle-preview component (if any) a game type has been ported with -
// shared between the pre-Start screen (MiniGamePlayer) and the shop's game
// detail modal (MiniGamesKidView).
export function previewFor(gameType: string): (() => ReactElement) | null {
  if (gameType === 'PIN_TUMBLER') return MiniGamePinTumblerPreview;
  if (gameType === 'WIRE_SPLICE') return MiniGameWireSplicePreview;
  return null;
}
