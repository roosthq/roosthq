import { useMemo, useState } from 'react';
import { useDragOrTapAsymmetric, modeForGrade } from '../dragOrTap';

// Math break, concept "Balance Builder" (Recess Concepts deck). A fixed
// target sits on one side of a seesaw; a fixed row of number tiles sits
// below. Grade 2+: drag a tile onto the scale. K-1: tap a tile, then tap
// the scale. Stack tiles until the total exactly equals the target - a
// tile that would push the total over the target is rejected (bounce),
// never a fail state.
const SCALE_TARGET_ID = 'scale';

function buildRound(grade: number) {
  const max = Math.min(20, 6 + grade * 2);
  const target = 4 + Math.floor(Math.random() * (max - 3));
  // A valid split of target into 2-3 parts, plus a couple of tiles that
  // don't belong so it's not "just add everything."
  const parts: number[] = [];
  let remaining = target;
  while (remaining > 0) {
    const take = remaining <= 3 ? remaining : 1 + Math.floor(Math.random() * Math.min(remaining - 1, 5));
    parts.push(take);
    remaining -= take;
    if (parts.length >= 3) {
      parts[parts.length - 1] += remaining;
      remaining = 0;
    }
  }
  const decoys = [target + 1 + Math.floor(Math.random() * 3), Math.max(1, Math.floor(target / 2) + 1)];
  const tiles = [...parts, ...decoys].sort(() => Math.random() - 0.5).map((value, i) => ({ id: `t${i}`, value }));
  return { target, tiles };
}

export default function BalanceBuilder({ grade, onDone }: { grade: number; onDone: () => void }) {
  const mode = modeForGrade(grade);
  const [round] = useState(() => buildRound(grade));
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sum = useMemo(() => round.tiles.filter((t) => used.has(t.id)).reduce((s, t) => s + t.value, 0), [round.tiles, used]);

  // A tile that overshoots was always bounced (no fail state), but nothing
  // stopped a kid stacking tiles that UNDERSHOOT into a dead end - e.g. a
  // decoy plus one real part leaves nothing left that reaches the target
  // exactly, and the old code had no way to take a placed tile back off the
  // scale. Placed tiles now stay tappable - tap one on the scale to send it
  // back to the tray instead of being stuck.
  function removeTile(tileId: string) {
    if (done) return;
    const next = new Set(used);
    next.delete(tileId);
    setUsed(next);
  }

  const { itemProps, targetProps, dragging } = useDragOrTapAsymmetric({
    mode,
    onCommit: (tileId) => {
      if (used.has(tileId) || done) return;
      const tile = round.tiles.find((t) => t.id === tileId);
      if (!tile) return;
      if (sum + tile.value > round.target) {
        setRejected(tileId);
        setTimeout(() => setRejected(null), 250);
        return;
      }
      const next = new Set(used);
      next.add(tileId);
      setUsed(next);
      if (sum + tile.value === round.target) {
        setDone(true);
        setTimeout(onDone, 700);
      }
    },
  });

  const tilt = done ? 0 : Math.max(-8, Math.min(8, ((round.target - sum) / round.target) * 8));
  const scaleProps = targetProps(SCALE_TARGET_ID);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <p className="text-sm font-semibold text-slate-600">
        {done ? '⚖️ Balanced!' : mode === 'drag' ? 'Quick break! Drag tiles onto the scale to balance it ⚖️' : 'Quick break! Tap a tile, then tap the scale ⚖️'}
      </p>

      <svg viewBox="0 0 240 110" width="100%" style={{ maxWidth: 320 }}>
        {/* Structural pieces (pivot/beam) tracked to the theme via CSS vars,
            not hardcoded slate hex - was a fixed light-gray, low contrast on
            a dark card. Target/sum boxes stay a solid branded blue - a
            SOLID fill with white text holds contrast in both themes, unlike
            a pale tint would. */}
        <rect x="115" y="70" width="10" height="30" style={{ fill: 'var(--text-2)' }} />
        <g transform={`rotate(${tilt} 120 70)`}>
          <line x1="20" y1="70" x2="220" y2="70" style={{ stroke: 'var(--text-2)' }} strokeWidth="4" />
          <rect x="20" y="70" width="46" height="20" rx="4" fill="#2e6f95" />
          <text x="43" y="84" textAnchor="middle" fontFamily="system-ui" fontSize="12" fill="white">
            {round.target}
          </text>
          <g {...scaleProps} style={{ cursor: 'pointer' }}>
            <rect
              x="154"
              y="70"
              width="66"
              height="20"
              rx="4"
              style={{ fill: scaleProps['data-hover'] ? 'var(--accent)' : 'none', fillOpacity: scaleProps['data-hover'] ? 0.18 : 1, stroke: '#2e6f95' }}
              strokeWidth="2"
            />
            <text x="187" y="84" textAnchor="middle" fontFamily="system-ui" fontSize="12" fill="#2e6f95">
              {sum}
            </text>
          </g>
        </g>
      </svg>

      {/* Placed tiles - tappable to send back to the tray. Old version hid
          them entirely once placed (`return null`), so a tile that pushed
          the total into a dead end (no remaining tile reaches the target
          exactly, none can be added without overshooting either) had no
          way back - stuck with no fail state and no fix. */}
      {used.size > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {round.tiles
            .filter((t) => used.has(t.id))
            .map((t) => (
              <button
                key={t.id}
                onClick={() => removeTile(t.id)}
                disabled={done}
                title="Tap to take this off the scale"
                className="flex h-10 w-10 items-center justify-center rounded-lg border-2 font-semibold text-slate-700 disabled:opacity-70"
                style={{ borderColor: 'var(--accent)', background: 'var(--tag-bg)' }}
              >
                {t.value}
              </button>
            ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {round.tiles.map((t) => {
          if (used.has(t.id)) return null;
          const props = itemProps(t.id);
          const isDragging = dragging?.id === t.id;
          return (
            <button
              key={t.id}
              {...props}
              style={{ touchAction: 'none', borderColor: props['data-selected'] ? 'var(--accent)' : 'var(--border)' }}
              className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 bg-white font-semibold text-slate-700 ${
                props['data-selected'] ? 'bg-slate-100' : ''
              } ${isDragging ? 'opacity-30' : ''} ${rejected === t.id ? 'animate-pulse border-red-400' : ''}`}
            >
              {t.value}
            </button>
          );
        })}
      </div>
      {used.size > 0 && !done && (
        <p className="text-xs text-slate-400">Tap a tile on the scale to take it back if you get stuck.</p>
      )}

      {mode === 'drag' && dragging && (
        <div
          style={{ position: 'fixed', left: dragging.x, top: dragging.y, transform: 'translate(-50%,-50%) scale(1.15)', pointerEvents: 'none', zIndex: 50, borderColor: 'var(--accent)' }}
          className="flex h-12 w-12 items-center justify-center rounded-lg border-2 bg-slate-100 font-semibold text-slate-700"
        >
          {round.tiles.find((t) => t.id === dragging.id)?.value}
        </div>
      )}
    </div>
  );
}
