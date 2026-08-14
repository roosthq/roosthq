import { useEffect, useRef, useState } from 'react';
import { celebrate } from './celebrate';
import type { SpinResult } from './rewardGames';

const BOARD_W = 288;
const BOARD_H = 260;
const SLOT_H = 28;
const PHYSICS_H = BOARD_H - SLOT_H;
const PEG_ROWS = 6;
const PEGS_PER_ROW = 7;
const PEG_R = 4;
const BALL_R = 7;
const GRAVITY = 0.32;
const BOUNCE_DAMPING = 0.55;

interface Peg {
  x: number;
  y: number;
}

function buildPegs(): Peg[] {
  const pegs: Peg[] = [];
  const colSpacing = BOARD_W / (PEGS_PER_ROW + 1);
  const rowSpacing = (PHYSICS_H - 50) / PEG_ROWS;
  for (let row = 0; row < PEG_ROWS; row++) {
    const y = 35 + row * rowSpacing;
    const offset = row % 2 === 1 ? colSpacing / 2 : 0;
    for (let col = 0; col < PEGS_PER_ROW; col++) {
      const x = colSpacing * (col + 1) + offset;
      if (x > BALL_R && x < BOARD_W - BALL_R) pegs.push({ x, y });
    }
  }
  return pegs;
}
const PEGS = buildPegs();

// A REAL gravity + peg-bounce sim, not a scripted step-by-step tween - the
// ball actually falls, actually bounces off pegs (reflected velocity, not a
// pre-picked path), and whichever "?" box it happens to land in is the one
// that flips to show the outcome. Same fairness rule every other reveal
// uses: onSpin() alone decides the outcome; the physics only decides
// which box gets to show it, and any box showing any outcome is equally
// fair (see #5's plan doc - "every box is cosmetically identical").
export default function PlinkoModal({
  min,
  max,
  slotCount = 7,
  source,
  tokenName = 'tokens',
  onSpin,
  onClose,
}: {
  min: number;
  max: number;
  slotCount?: number;
  source?: string;
  tokenName?: string;
  onSpin: () => Promise<SpinResult>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<SpinResult | null>(null);
  const [dropping, setDropping] = useState(false);
  const [landedSlot, setLandedSlot] = useState<number | null>(null);
  const [ballPos, setBallPos] = useState({ x: BOARD_W / 2, y: 0 });
  const [ballVisible, setBallVisible] = useState(false);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function runPhysics(): Promise<number> {
    return new Promise((resolve) => {
      const ball = { x: BOARD_W / 2 + (Math.random() - 0.5) * 6, y: BALL_R, vx: (Math.random() - 0.5) * 1.2, vy: 0 };
      setBallVisible(true);
      const step = () => {
        ball.vy += GRAVITY;
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Walls
        if (ball.x < BALL_R) {
          ball.x = BALL_R;
          ball.vx = Math.abs(ball.vx) * BOUNCE_DAMPING;
        } else if (ball.x > BOARD_W - BALL_R) {
          ball.x = BOARD_W - BALL_R;
          ball.vx = -Math.abs(ball.vx) * BOUNCE_DAMPING;
        }

        // Pegs - reflect velocity off the first one we're overlapping this frame.
        for (const peg of PEGS) {
          const dx = ball.x - peg.x;
          const dy = ball.y - peg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = BALL_R + PEG_R;
          if (dist < minDist && dist > 0.001) {
            const nx = dx / dist;
            const ny = dy / dist;
            // Push the ball back out of the peg so it doesn't tunnel/stick.
            const overlap = minDist - dist;
            ball.x += nx * overlap;
            ball.y += ny * overlap;
            // Reflect velocity across the collision normal, damped, plus a
            // little random kick - a real Galton board's chaos comes from
            // tiny variations at each bounce, not a deterministic path.
            const vDotN = ball.vx * nx + ball.vy * ny;
            ball.vx = (ball.vx - 2 * vDotN * nx) * BOUNCE_DAMPING + (Math.random() - 0.5) * 0.6;
            ball.vy = (ball.vy - 2 * vDotN * ny) * BOUNCE_DAMPING;
            break;
          }
        }

        setBallPos({ x: ball.x, y: ball.y });

        if (ball.y >= PHYSICS_H - BALL_R) {
          const slot = Math.min(slotCount - 1, Math.max(0, Math.floor((ball.x / BOARD_W) * slotCount)));
          resolve(slot);
          return;
        }
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    });
  }

  async function drop() {
    if (dropping || result) return;
    setDropping(true);
    setLandedSlot(null);
    setBallVisible(false);
    const spinPromise = onSpin();
    const [slot, r] = await Promise.all([
      runPhysics(),
      spinPromise.catch(() => null),
    ]);
    if (!r) {
      setDropping(false);
      setBallVisible(false);
      return;
    }
    setLandedSlot(slot);
    setResult(r);
    setDropping(false);
    setBallVisible(false);
    celebrate(undefined, 'rewardGameWin');
  }

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">⚪ Plinko drop</h2>
      {source && (
        <p className="max-w-xs text-center text-base font-semibold" style={{ color: 'var(--today)' }}>
          You earned it for {source}
        </p>
      )}
      <p className="max-w-xs text-center text-sm text-slate-300">
        {result ? 'You won' : dropping ? 'Dropping…' : `Drop the ball (${min}-${max} ${tokenName}, or a real prize)`}
      </p>
      <div className="rgm-dark-2 relative overflow-hidden rounded-xl shadow-lg" style={{ width: BOARD_W, height: BOARD_H }}>
        {PEGS.map((peg, i) => (
          <span
            key={i}
            className="rgm-muted-text absolute rounded-full"
            style={{ width: PEG_R * 2, height: PEG_R * 2, left: peg.x - PEG_R, top: peg.y - PEG_R, background: 'currentColor' }}
          />
        ))}
        {ballVisible && (
          <div
            className="rgm-surface absolute rounded-full shadow"
            style={{ width: BALL_R * 2, height: BALL_R * 2, left: ballPos.x - BALL_R, top: ballPos.y - BALL_R }}
          />
        )}
        <div className="absolute bottom-0 flex w-full" style={{ height: SLOT_H, borderTop: '1px solid #475569' }}>
          {Array.from({ length: slotCount }, (_, i) => (
            <span
              key={i}
              className="flex flex-1 items-center justify-center border-r text-sm"
              style={{
                borderColor: '#475569',
                background: landedSlot === i ? '#fbbf24' : '#334155',
                color: landedSlot === i ? '#1e293b' : '#94a3b8',
                fontWeight: landedSlot === i ? 700 : 400,
              }}
            >
              {landedSlot === i && result ? (result.wonKind === 'PRIZE' ? result.prize?.icon ?? '🎁' : `+${result.amount}`) : '?'}
            </span>
          ))}
        </div>
      </div>
      {result ? (
        <>
          {result.wonKind === 'PRIZE' ? (
            <div className="flex flex-col items-center gap-1 text-4xl font-extrabold text-white">
              <span className="text-5xl">{result.prize?.icon ?? '🎁'}</span>
              <span>{result.prize?.name}!</span>
            </div>
          ) : result.wonKind === 'STREAK_FREEZE' ? (
            <div className="text-5xl font-extrabold text-white">🧊 +{result.amount} streak freeze{result.amount === 1 ? '' : 's'}!</div>
          ) : (
            <div className="text-5xl font-extrabold text-white">
              +{result.amount} {tokenName}!
            </div>
          )}
          {source && <div className="text-sm text-slate-300">for {source}</div>}
          <button onClick={onClose} className="rgm-btn rounded-lg px-6 py-2.5 font-semibold">
            Collect
          </button>
        </>
      ) : (
        <button disabled={dropping} onClick={() => void drop()} className="rgm-btn rounded-lg px-6 py-2.5 font-semibold disabled:opacity-50">
          {dropping ? 'Dropping…' : 'Drop ball'}
        </button>
      )}
    </div>
  );
}
