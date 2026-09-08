import type { ReactElement } from 'react';
import MiniGamePinTumbler, { MiniGamePinTumblerPreview, type MiniGamePlayReport } from './MiniGamePinTumbler';
import MiniGameWireSplice, { MiniGameWireSplicePreview } from './MiniGameWireSplice';
import MiniGameSignalRelay, { MiniGameSignalRelayPreview } from './MiniGameSignalRelay';
import MiniGameCargoSort, { MiniGameCargoSortPreview } from './MiniGameCargoSort';
import type { MiniGameConfig } from './api';

// One shared registry for "which real component does this gameType have" -
// used by MiniGamePlayer's playing phase, MiniGamesTab's no-stakes
// PreviewModal, and the idle-preview dispatch below. A gameType with no
// entry here just hasn't been ported yet; every call site's own fallback
// (a placeholder message, or a static icon) covers that consistently.
const PLAY: Record<string, (props: { config: MiniGameConfig; onFinish: (report: MiniGamePlayReport) => void }) => ReactElement> = {
  PIN_TUMBLER: MiniGamePinTumbler,
  WIRE_SPLICE: MiniGameWireSplice,
  SIGNAL_RELAY: MiniGameSignalRelay,
  CARGO_SORT: MiniGameCargoSort,
};
const PREVIEW: Record<string, () => ReactElement> = {
  PIN_TUMBLER: MiniGamePinTumblerPreview,
  WIRE_SPLICE: MiniGameWireSplicePreview,
  SIGNAL_RELAY: MiniGameSignalRelayPreview,
  CARGO_SORT: MiniGameCargoSortPreview,
};

export function playFor(gameType: string) {
  return PLAY[gameType] ?? null;
}

// Which idle-preview component (if any) a game type has been ported with -
// shared between the pre-Start screen (MiniGamePlayer) and the shop's game
// detail modal (MiniGamesKidView).
export function previewFor(gameType: string) {
  return PREVIEW[gameType] ?? null;
}
