import { useEffect, useState } from 'react';
import Logo from './Logo';

// Full-screen clock shown after DisplayConfig.screensaverMinutes of no touch/
// mouse/key activity (see the idle-timer effect in Display.tsx). Tapping
// anywhere dismisses it — the tap itself also counts as activity via the same
// document-level listeners, so the idle timer restarts automatically.
export default function Screensaver({ onDismiss }: { onDismiss: () => void }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      onClick={onDismiss}
      onTouchStart={onDismiss}
      className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-black"
    >
      {/* Slow drift so the bright clock text isn't pinned to the exact same
          pixels for hours at a stretch — cheap insurance against LCD burn-in,
          imperceptible as motion. */}
      <style>{`
        @keyframes rhq-screensaver-drift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(3vw, 2vh); }
        }
      `}</style>
      <div
        className="flex flex-col items-center gap-3"
        style={{ animation: 'rhq-screensaver-drift 90s ease-in-out infinite' }}
      >
        <Logo size={48} />
        <div className="text-8xl font-bold tabular-nums text-white">
          {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
        <div className="text-xl text-slate-400">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div className="mt-8 text-sm text-slate-600">Tap to wake</div>
      </div>
    </div>
  );
}
