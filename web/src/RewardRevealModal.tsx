import WheelModal from './WheelModal';
import MysteryBoxModal from './MysteryBoxModal';
import ScratchCardModal from './ScratchCardModal';
import SlotMachineModal from './SlotMachineModal';
import type { PendingWheel } from './api';

// Picks which reveal presentation to render for a pending WheelSpin.
// style is purely cosmetic - every presentation shares the exact same
// fairness contract (onSpin() is the only thing that decides the amount,
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
  onSpin: () => Promise<number>;
  onClose: () => void;
}) {
  const props = { min: wheel.minTokens, max: wheel.maxTokens, source, tokenName, onSpin, onClose };
  switch (wheel.style) {
    case 'MYSTERY_BOX':
      return <MysteryBoxModal {...props} />;
    case 'SCRATCH_CARD':
      return <ScratchCardModal {...props} />;
    case 'SLOT_MACHINE':
      return <SlotMachineModal {...props} />;
    default:
      return <WheelModal {...props} />;
  }
}
