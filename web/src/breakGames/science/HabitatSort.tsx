import { useState, type ReactElement } from 'react';
import { useDragOrTapAsymmetric, modeForGrade } from '../dragOrTap';

// Science break, concept "Habitat Sort" (Recess Concepts deck). Fixed row of
// animals, fixed row of habitats, nothing falls or times out. Grade 2+:
// real drag, tile follows the pointer via a fixed-position ghost (escapes
// any overflow:hidden ancestor - the old HabitatBuilder's bug was the
// dragged sprite being visually clamped inside its own falling-lane box).
// K-1: tap the animal, then tap its habitat.
type AnimalId = 'fish' | 'camel' | 'owl';
const ANIMALS: AnimalId[] = ['fish', 'camel', 'owl'];
const HABITAT_OF: Record<AnimalId, string> = { fish: 'Ocean', camel: 'Desert', owl: 'Forest' };
const ZONE_NAMES = ['Ocean', 'Desert', 'Forest'];

function FishIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M8 20c4-7 14-9 20-4 3 2 3 6 0 8-6 5-16 3-20-4z" fill="#4aa3d8" />
      <path d="M28 16l8-4v16l-8-4z" fill="#3a8fc4" />
      <circle cx="14" cy="19" r="1.6" fill="#1c2b36" />
    </svg>
  );
}
function CamelIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M8 30c0-6 3-9 6-9 1-4 5-6 8-3 1-3 5-4 7-1 3 1 4 5 2 8l1 5H8z" fill="#c9975a" />
      <path d="M13 21c0-3 2-5 3-3" stroke="#c9975a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="23" r="1.4" fill="#4a3521" />
      <path d="M10 30v4M30 30v4" stroke="#a1723d" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function OwlIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <ellipse cx="20" cy="22" rx="12" ry="13" fill="#8a6a45" />
      <circle cx="15" cy="18" r="5" fill="#fff" />
      <circle cx="25" cy="18" r="5" fill="#fff" />
      <circle cx="15" cy="18" r="2.2" fill="#2b1d10" />
      <circle cx="25" cy="18" r="2.2" fill="#2b1d10" />
      <path d="M20 21l-3 4h6z" fill="#e8a13c" />
      <path d="M10 12l4 4M30 12l-4 4" stroke="#8a6a45" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
const ANIMAL_ICONS: Record<AnimalId, (p: { size: number }) => ReactElement> = { fish: FishIcon, camel: CamelIcon, owl: OwlIcon };

function OceanZone() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <rect width="72" height="72" rx="10" fill="#dbeeff" />
      <path d="M6 44c6-6 12-6 18 0s12 6 18 0 12-6 18 0v20H6z" fill="#5b8fd8" />
    </svg>
  );
}
function DesertZone() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <rect width="72" height="72" rx="10" fill="#fff3d6" />
      <circle cx="54" cy="16" r="8" fill="#f2c14e" />
      <path d="M4 56c10-10 20-10 30 0s20 10 30 0v14H4z" fill="#e0b169" />
    </svg>
  );
}
function ForestZone() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <rect width="72" height="72" rx="10" fill="#e4f2df" />
      <path d="M18 50V64M18 30l-8 14h16z" fill="#6a4a2c" />
      <path d="M18 46l-9 12h18z" fill="#4a8f3c" />
      <path d="M46 54V64M46 26l-9 16h18z" fill="#6a4a2c" />
      <path d="M46 50l-10 12h20z" fill="#5fa84a" />
    </svg>
  );
}
const ZONE_ICONS: Record<string, () => ReactElement> = { Ocean: OceanZone, Desert: DesertZone, Forest: ForestZone };

export default function HabitatSort({ grade, onDone }: { grade: number; onDone: () => void }) {
  const mode = modeForGrade(grade);
  const [placed, setPlaced] = useState<Set<AnimalId>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);

  const { itemProps, targetProps, dragging, selected } = useDragOrTapAsymmetric({
    mode,
    onCommit: (animalId, zone) => {
      const a = animalId as AnimalId;
      if (placed.has(a)) return;
      if (HABITAT_OF[a] === zone) {
        const next = new Set(placed);
        next.add(a);
        setPlaced(next);
        if (next.size === ANIMALS.length) setTimeout(onDone, 700);
      } else {
        setWrongFlash(zone);
        setTimeout(() => setWrongFlash(null), 250);
      }
    },
  });

  const done = placed.size === ANIMALS.length;
  const draggedIcon = dragging ? ANIMAL_ICONS[dragging.id as AnimalId] : null;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {done ? '🌎 Everyone found home!' : mode === 'drag' ? 'Quick break! Drag each animal to its home 🏞️' : 'Quick break! Tap an animal, then tap its home 🏞️'}
      </p>

      <div className="flex justify-center gap-6">
        {ANIMALS.map((a) => {
          const Icon = ANIMAL_ICONS[a];
          if (placed.has(a)) return <div key={a} className="h-11 w-11" />;
          const props = itemProps(a);
          const isSelected = selected === a;
          const isDragging = dragging?.id === a;
          return (
            <button
              key={a}
              {...props}
              style={{ touchAction: 'none' }}
              className={`rounded-lg border-2 bg-white p-1.5 ${isSelected ? 'border-amber-400' : 'border-transparent'} ${isDragging ? 'opacity-30' : ''}`}
            >
              <Icon size={44} />
            </button>
          );
        })}
      </div>

      <div className="flex gap-4">
        {ZONE_NAMES.map((zone) => {
          const Zone = ZONE_ICONS[zone];
          const props = targetProps(zone);
          return (
            <button
              key={zone}
              {...props}
              style={{ touchAction: 'none' }}
              className={`flex flex-col items-center gap-1 rounded-lg ${wrongFlash === zone ? 'animate-pulse' : ''}`}
            >
              <div className={props['data-hover'] ? 'ring-2 ring-amber-400 rounded-lg' : ''}>
                <Zone />
              </div>
              <span className="text-xs text-slate-500">
                {zone} {[...placed].some((a) => HABITAT_OF[a] === zone) ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {mode === 'drag' && dragging && draggedIcon && (
        <div style={{ position: 'fixed', left: dragging.x, top: dragging.y, transform: 'translate(-50%,-50%) scale(1.2)', pointerEvents: 'none', zIndex: 50 }}>
          {draggedIcon({ size: 48 })}
        </div>
      )}
    </div>
  );
}
