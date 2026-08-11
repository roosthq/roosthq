// Shared types/metadata for #5, the reward-games platform (renamed from the
// single bonus wheel - see RewardGamesService server-side). Every reveal
// modal shares one result shape so a new game type never needs a new
// contract: onSpin() always resolves to a SpinResult, decided server-side at
// the moment of picking, regardless of which of the 8 presentations below is
// showing it.

import type { PoolEntry } from './api';

export interface SpinResult {
  wonKind: 'TOKENS' | 'PRIZE';
  amount?: number;
  prize?: { name: string; icon: string | null } | null;
}

export const GAME_TYPES = [
  'WHEEL',
  'MYSTERY_BOX',
  'SCRATCH_CARD',
  'SLOT_MACHINE',
  'DICE_ROLL',
  'COIN_FLIP',
  'GIFT_BOX',
  'PLINKO',
] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const GAME_TYPE_META: Record<GameType, { label: string; icon: string; help: string }> = {
  WHEEL: { label: 'Wheel spin', icon: '🎡', help: 'Price-is-right style spinning wheel' },
  MYSTERY_BOX: { label: 'Mystery box picker', icon: '📦', help: 'Grid of identical crates, pick one' },
  SCRATCH_CARD: { label: 'Scratch card', icon: '🎟️', help: 'Drag to reveal under a gray coating' },
  SLOT_MACHINE: { label: 'Slot machine', icon: '🎰', help: 'Pull the lever, three reels spin' },
  DICE_ROLL: { label: 'Dice roll', icon: '🎲', help: 'Shake and drop - the total picks the tier' },
  COIN_FLIP: { label: 'Coin flip', icon: '🪙', help: 'Fast heads/tails double-or-nothing' },
  GIFT_BOX: { label: 'Gift box unwrap', icon: '🎁', help: 'One wrapped present, paper peels open in place' },
  PLINKO: { label: 'Plinko drop', icon: '⚪', help: 'Ball bounces down pegs into a payout slot' },
};

// Client-only fake roll for the pool builder's live preview (#5's resolved
// open question) - never hits the server, never touches a ledger, just gives
// the reveal modal something to show so an adult can compare presentations
// before picking one. A brief delay so it still feels like "playing", not an
// instant snap.
//
// Mirrors the REAL weighted pick (reward-games.service.ts rollPool) so a
// prize entry in the pool actually shows up sometimes in preview too, not
// just a token amount - otherwise "preview" never demonstrates what winning
// an actual prize looks like, which is the whole point of previewing a pool
// that includes one.
export function fakePreviewRoll(
  pool: PoolEntry[],
  prizeNameById: Record<string, string>,
  fallbackMin: number,
  fallbackMax: number,
): Promise<SpinResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!pool.length) {
        const amount = fallbackMin + Math.floor(Math.random() * (Math.max(fallbackMin, fallbackMax) - fallbackMin + 1));
        resolve({ wonKind: 'TOKENS', amount });
        return;
      }
      const totalWeight = pool.reduce((s, p) => s + (p.weight ?? 1), 0);
      let r = Math.random() * totalWeight;
      let picked = pool[pool.length - 1];
      for (const p of pool) {
        r -= p.weight ?? 1;
        if (r <= 0) {
          picked = p;
          break;
        }
      }
      if (picked.kind === 'PRIZE') {
        // Real reveal never shows the product photo either (see
        // reward-games.service.ts's prizeIcon()) - just the name, falling
        // back to a generic 🎁 in the modal itself.
        resolve({ wonKind: 'PRIZE', prize: { name: prizeNameById[picked.prizeId] ?? 'Prize', icon: null } });
      } else {
        const amount = picked.min + Math.floor(Math.random() * (Math.max(picked.min, picked.max) - picked.min + 1));
        resolve({ wonKind: 'TOKENS', amount });
      }
    }, 250);
  });
}
