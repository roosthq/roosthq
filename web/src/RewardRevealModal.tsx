import WheelModal from './WheelModal';
import MysteryBoxModal from './MysteryBoxModal';
import ScratchCardModal from './ScratchCardModal';
import SlotMachineModal from './SlotMachineModal';
import DiceRollModal from './DiceRollModal';
import CoinFlipModal from './CoinFlipModal';
import GiftBoxModal from './GiftBoxModal';
import PlinkoModal from './PlinkoModal';
import type { PendingWheel } from './api';
import type { SpinResult } from './rewardGames';

// Picks which reveal presentation to render for a pending RewardGame.
// style is purely cosmetic - every presentation shares the exact same
// fairness contract (onSpin() is the only thing that decides the outcome,
// rolled server-side at that moment); this just varies which animation a
// kid sees so it isn't the same wheel every single time.
export default function RewardRevealModal({
  wheel,
  source,
  tokenName,
  onSpin,
  onClose,
}: {
  wheel: PendingWheel;
  source?: string;
  tokenName: string;
  onSpin: () => Promise<SpinResult>;
  onClose: () => void;
}) {
  const props = { min: wheel.minTokens, max: wheel.maxTokens, slotCount: wheel.slotCount ?? undefined, source, tokenName, onSpin, onClose };
  switch (wheel.style) {
    case 'MYSTERY_BOX':
      return <MysteryBoxModal {...props} />;
    case 'GIFT_BOX':
      return <GiftBoxModal {...props} />;
    case 'SCRATCH_CARD':
      return <ScratchCardModal {...props} />;
    case 'SLOT_MACHINE':
      return <SlotMachineModal {...props} />;
    case 'DICE_ROLL':
      return <DiceRollModal {...props} />;
    case 'COIN_FLIP':
      return <CoinFlipModal {...props} />;
    case 'PLINKO':
      return <PlinkoModal {...props} />;
    default:
      return <WheelModal {...props} />;
  }
}
