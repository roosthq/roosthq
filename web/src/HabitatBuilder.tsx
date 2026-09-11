import { useEffect, useRef, useState, type ReactElement } from 'react';

// Science's arcade break (PLANNING.md §19) - "Habitat Rescue". One animal
// at a time falls from the top; drag it into its correct habitat zone
// before it reaches the bottom, or it respawns and falls again (no-stakes,
// no fail). Real drag-under-time-pressure, not a static tap-to-select pair
// (that version had no motion or urgency - fair pushback, not really a
// game). Real hand-drawn SVG animals and habitat scenes.
type AnimalId = 'fish' | 'camel' | 'owl';
const ANIMALS: AnimalId[] = ['fish', 'camel', 'owl'];
const HABITAT_OF: Record<AnimalId, string> = { fish: 'Ocean', camel: 'Desert', owl: 'Forest' };
const FALL_MS = 4200;

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
    <svg width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#dbeeff" />
      <path d="M4 40c6-5 10-5 16 0s10 5 16 0 10-5 16 0v20H4z" fill="#5b8fd8" />
    </svg>
  );
}
function DesertZone() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#fff3d6" />
      <circle cx="48" cy="14" r="7" fill="#f2c14e" />
      <path d="M2 50c9-9 18-9 27 0s18 9 27 0v12H2z" fill="#e0b169" />
    </svg>
  );
}
function ForestZone() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#e4f2df" />
      <path d="M16 46v12M16 27l-7 12h14z" fill="#4a8f3c" />
      <path d="M42 48v10M42 24l-8 14h16z" fill="#5fa84a" />
    </svg>
  );
}
const ZONES: { name: string; Icon: () => ReactElement }[] = [
  { name: 'Ocean', Icon: OceanZone },
  { name: 'Desert', Icon: DesertZone },
  { name: 'Forest', Icon: ForestZone },
];

export default function HabitatBuilder({ onDone }: { onDone: () => void }) {
  const [remaining, setRemaining] = useState<AnimalId[]>([...ANIMALS].sort(() => Math.random() - 0.5));
  const [rescued, setRescued] = useState<Set<AnimalId>>(new Set());
  const [pos, setPos] = useState({ xPct: 45, yPct: 0 });
  const [dragging, setDragging] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [finished, setFinished] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const draggingRef = useRef(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  const current = remaining[0] ?? null;

  useEffect(() => {
    if (!current || finished) return;
    startRef.current = null;
    setPos({ xPct: 15 + Math.random() * 60, yPct: 0 });
    function tick(ts: number) {
      if (draggingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (startRef.current === null) startRef.current = ts - (posRef.current.yPct / 78) * FALL_MS;
      const yPct = Math.min(78, ((ts - startRef.current) / FALL_MS) * 78);
      setPos((p) => ({ ...p, yPct }));
      if (yPct >= 78) {
        // Reached the bottom without being placed - respawn, no penalty.
        startRef.current = null;
        setPos({ xPct: 15 + Math.random() * 60, yPct: 0 });
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, finished]);

  function onPointerDown(e: React.PointerEvent) {
    if (!current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    setPos({ xPct, yPct });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!draggingRef.current || !current) return;
    draggingRef.current = false;
    setDragging(false);
    for (const [zoneName, el] of Object.entries(zoneRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (HABITAT_OF[current] === zoneName) {
          const nextRescued = new Set(rescued);
          nextRescued.add(current);
          setRescued(nextRescued);
          const nextRemaining = remaining.slice(1);
          setRemaining(nextRemaining);
          if (nextRemaining.length === 0) {
            setFinished(true);
            setTimeout(onDone, 700);
          }
          return;
        }
        setWrongFlash(true);
        setTimeout(() => setWrongFlash(false), 250);
        return;
      }
    }
    // Released somewhere with no zone under it - falling resumes from here.
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {finished ? '🌎 Everyone found home!' : 'Quick break! Drag the falling animal into its habitat 🏞️'}
      </p>

      <div
        ref={stageRef}
        className="relative h-52 w-full overflow-hidden rounded-lg bg-slate-50"
        style={{ touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {current && !finished && (
          <div
            onPointerDown={onPointerDown}
            className={`absolute -translate-x-1/2 cursor-grab ${dragging ? 'scale-110' : ''} ${wrongFlash ? 'animate-pulse' : ''}`}
            style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, touchAction: 'none' }}
          >
            {(() => {
              const Icon = ANIMAL_ICONS[current];
              return <Icon size={44} />;
            })()}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {ZONES.map(({ name, Icon }) => (
          <div
            key={name}
            ref={(el) => {
              zoneRefs.current[name] = el;
            }}
            className="flex flex-col items-center gap-1"
          >
            <Icon />
            <span className="text-xs text-slate-500">
              {name} {[...rescued].some((a) => HABITAT_OF[a] === name) ? '✓' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
