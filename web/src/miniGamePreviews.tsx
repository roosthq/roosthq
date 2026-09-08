import type { ReactElement } from 'react';
import MiniGamePinTumbler, { MiniGamePinTumblerPreview, type MiniGamePlayReport } from './MiniGamePinTumbler';
import MiniGameSafeCracker, { MiniGameSafeCrackerPreview } from './MiniGameSafeCracker';
import MiniGameWireSplice, { MiniGameWireSplicePreview } from './MiniGameWireSplice';
import MiniGameSignalRelay, { MiniGameSignalRelayPreview } from './MiniGameSignalRelay';
import MiniGameCargoSort, { MiniGameCargoSortPreview } from './MiniGameCargoSort';
import MiniGameFuseTrace, { MiniGameFuseTracePreview } from './MiniGameFuseTrace';
import MiniGameReactorCalibration, { MiniGameReactorCalibrationPreview } from './MiniGameReactorCalibration';
import MiniGameBugZapper, { MiniGameBugZapperPreview } from './MiniGameBugZapper';
import MiniGameCircuitMatch, { MiniGameCircuitMatchPreview } from './MiniGameCircuitMatch';
import MiniGameCodeBreaker, { MiniGameCodeBreakerPreview } from './MiniGameCodeBreaker';
import type { MiniGameConfig } from './api';

// One shared registry for "which real component does this gameType have" -
// used by MiniGamePlayer's playing phase, MiniGamesTab's no-stakes
// PreviewModal, and the idle-preview dispatch below. All ten Task Deck
// prototypes are ported now (PLANNING.md §18) - a gameType with no entry
// here would mean a future eleventh game hasn't been ported yet.
const PLAY: Record<string, (props: { config: MiniGameConfig; onFinish: (report: MiniGamePlayReport) => void }) => ReactElement> = {
  PIN_TUMBLER: MiniGamePinTumbler,
  SAFE_CRACKER: MiniGameSafeCracker,
  WIRE_SPLICE: MiniGameWireSplice,
  SIGNAL_RELAY: MiniGameSignalRelay,
  CARGO_SORT: MiniGameCargoSort,
  FUSE_TRACE: MiniGameFuseTrace,
  REACTOR_CALIBRATION: MiniGameReactorCalibration,
  BUG_ZAPPER: MiniGameBugZapper,
  CIRCUIT_MATCH: MiniGameCircuitMatch,
  CODE_BREAKER: MiniGameCodeBreaker,
};
const PREVIEW: Record<string, () => ReactElement> = {
  PIN_TUMBLER: MiniGamePinTumblerPreview,
  SAFE_CRACKER: MiniGameSafeCrackerPreview,
  WIRE_SPLICE: MiniGameWireSplicePreview,
  SIGNAL_RELAY: MiniGameSignalRelayPreview,
  CARGO_SORT: MiniGameCargoSortPreview,
  FUSE_TRACE: MiniGameFuseTracePreview,
  REACTOR_CALIBRATION: MiniGameReactorCalibrationPreview,
  BUG_ZAPPER: MiniGameBugZapperPreview,
  CIRCUIT_MATCH: MiniGameCircuitMatchPreview,
  CODE_BREAKER: MiniGameCodeBreakerPreview,
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
