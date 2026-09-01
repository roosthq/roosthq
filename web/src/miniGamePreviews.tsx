import { MiniGamePinTumblerPreview } from './MiniGamePinTumbler';

// Which idle-preview component (if any) a game type has been ported with -
// shared between the pre-Start screen (MiniGamePlayer) and the shop's game
// detail modal (MiniGamesKidView), same dispatch shape as MiniGamePlayer's
// own `playing`-phase dispatch, so a future port (Wire Splice is next per
// PLANNING.md §18) adds one line here and one line there.
export function previewFor(gameType: string) {
  if (gameType === 'PIN_TUMBLER') return MiniGamePinTumblerPreview;
  return null;
}
