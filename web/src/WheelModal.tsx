import { useEffect, useMemo, useRef, useState } from 'react';
import { celebrate } from './celebrate';

const COLORS = ['#4e7a4c', '#d4c06a', '#5baedd', '#e07c5c', '#b58ae0', '#2a9a78', '#b84878', '#a07840'];

// Full-screen bonus wheel. The AMOUNT is already decided (and banked) by the
// server — this wheel is theater that always lands on it. Spin by dragging
// (finger velocity on the kiosk/tablet) or with the Spin button.
export default function WheelModal({
  amount,
  min,
  max,
  label,
  onClose,
}: {
  amount: number;
  min: number;
  max: number;
  label?: string;
  onClose: () => void;
}) {
  // Segment values min..max, repeated until the wheel has >= 8 slices so a
  // small range (1-3) still looks like a wheel.
  const segments = useMemo(() => {
    const values: number[] = [];
    for (let v = Math.min(min, max); v <= Math.max(min, max); v++) values.push(v);
    const out: number[] = [];
    while (out.length < 8) out.push(...values);
    return out;
  }, [min, max]);

  // Which slice we land on — picked once, among slices holding the amount.
  const targetIndex = useMemo(() => {
    const matches = segments.map((v, i) => (v === amount ? i : -1)).filter((i) => i >= 0);
    return matches[Math.floor(Math.random() * matches.length)] ?? 0;
  }, [segments, amount]);

  const [done, setDone] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const wheelRef = useRef<SVGSVGElement>(null);
  const rotation = useRef(0);
  const raf = useRef(0);
  const drag = useRef<{ lastAngle: number; lastTime: number; velocity: number; active: boolean }>({
    lastAngle: 0,
    lastTime: 0,
    velocity: 0,
    active: false,
  });

  const segAngle = 360 / segments.length;

  function applyRotation() {
    if (wheelRef.current) wheelRef.current.style.transform = `rotate(${rotation.current}deg)`;
  }

  // Animate from the current rotation to a final rotation that puts the
  // target slice's center under the top pointer, with ease-out so it "runs
  // out of steam" naturally.
  function launch(velocityDegPerMs: number) {
    if (spinning || done) return;
    setSpinning(true);
    const speed = Math.min(4, Math.max(1.2, Math.abs(velocityDegPerMs)));
    const baseTravel = speed * 1400; // faster fling = longer spin
    // Target slice center must end at the top (pointer): rotation ≡ -center (mod 360).
    const targetCenter = targetIndex * segAngle + segAngle / 2;
    const desiredMod = ((-targetCenter % 360) + 360) % 360;
    const start = rotation.current;
    const minFinal = start + Math.max(baseTravel, 3 * 360);
    const final = minFinal + ((desiredMod - (minFinal % 360) + 360) % 360);
    const duration = 2600 + speed * 600;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      rotation.current = start + (final - start) * eased;
      applyRotation();
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setSpinning(false);
        setDone(true);
        celebrate(wheelRef.current ? (wheelRef.current as unknown as HTMLElement) : undefined);
      }
    };
    raf.current = requestAnimationFrame(tick);
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function angleAt(e: { clientX: number; clientY: number }): number {
    const rect = wheelRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (spinning || done) return;
    drag.current = { lastAngle: angleAt(e), lastTime: performance.now(), velocity: 0, active: true };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active || spinning || done) return;
    const angle = angleAt(e);
    const now = performance.now();
    let delta = angle - d.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const dt = Math.max(1, now - d.lastTime);
    d.velocity = delta / dt;
    d.lastAngle = angle;
    d.lastTime = now;
    // Wheel follows the finger while dragging.
    rotation.current += delta;
    applyRotation();
  }
  function onPointerUp() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (Math.abs(d.velocity) > 0.25) launch(Math.abs(d.velocity) * 2);
  }

  const R = 150;
  const cx = 160;
  const cy = 160;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <h2 className="text-2xl font-bold text-white">🎡 {label ?? 'Bonus wheel!'}</h2>
      <p className="text-sm text-slate-300">{done ? 'You won:' : 'Flick the wheel to spin!'}</p>
      <div className="relative" style={{ touchAction: 'none' }}>
        {/* pointer */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{ width: 0, height: 0, borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderTop: '22px solid #fff' }}
        />
        <svg
          ref={wheelRef}
          viewBox="0 0 320 320"
          className="h-72 w-72 cursor-grab select-none sm:h-80 sm:w-80"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {segments.map((v, i) => {
            const a0 = ((i * segAngle - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * segAngle - 90) * Math.PI) / 180;
            const x0 = cx + R * Math.cos(a0);
            const y0 = cy + R * Math.sin(a0);
            const x1 = cx + R * Math.cos(a1);
            const y1 = cy + R * Math.sin(a1);
            const mid = ((i + 0.5) * segAngle - 90) * (Math.PI / 180);
            const tx = cx + R * 0.62 * Math.cos(mid);
            const ty = cy + R * 0.62 * Math.sin(mid);
            return (
              <g key={i}>
                <path d={`M ${cx} ${cy} L ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1} Z`} fill={COLORS[i % COLORS.length]} stroke="#111" strokeWidth="1" />
                <text x={tx} y={ty} fill="#fff" fontSize="22" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                  {v}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="26" fill="#1c2e1c" stroke="#fff" strokeWidth="3" />
          <text x={cx} y={cy} fill="#fff" fontSize="18" textAnchor="middle" dominantBaseline="central">
            🎡
          </text>
        </svg>
      </div>
      {done ? (
        <>
          <div className="text-5xl font-extrabold text-white">+{amount}!</div>
          <button onClick={onClose} className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200">
            Collect
          </button>
        </>
      ) : (
        <button
          disabled={spinning}
          onClick={() => launch(1.5 + Math.random() * 1.5)}
          className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        >
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
      )}
    </div>
  );
}
