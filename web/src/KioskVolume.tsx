import { useEffect, useRef, useState } from 'react';
import { setMuted, setVolume, useAudioState } from './audioMaster';
import { playBuiltinSound } from './sounds';

// Volume + mute for the wall display. Sits with the other display buttons
// (screensaver, refresh, full screen), so like them it is deliberately NOT
// behind a PIN: it controls the speaker on this one device, not family data.
// Tap the speaker to open the panel; the panel has a big mute switch and a
// slider that plays a short chime when you let go, so the new level can be
// judged by ear.
export default function KioskVolume() {
  const { volume, muted } = useAudioState();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const silent = muted || volume === 0;
  const icon = silent ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={silent ? 'Sound is off' : `Volume ${Math.round(volume * 100)}%`}
        aria-label="Volume and mute"
        aria-expanded={open}
        className="kiosk-compact-btn rounded border px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        {icon}
      </button>
      {open && (
        <div role="dialog" aria-label="Volume" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-white p-4 shadow-lg"
          style={{ boxShadow: 'var(--shadow-md)' }}>
          <button
            onClick={() => setMuted(!muted)}
            aria-pressed={muted}
            className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-base font-semibold ${
              muted ? 'bg-slate-800 text-white' : 'border hover:bg-slate-100'
            }`}
          >
            <span aria-hidden>{muted ? '🔇' : '🔊'}</span> {muted ? 'Muted - tap to turn sound on' : 'Mute'}
          </button>
          <label className="block text-sm text-slate-500">
            <span className="mb-1 flex justify-between">
              <span>Volume</span>
              <span className="tabular-nums">{muted ? 'Muted' : `${Math.round(volume * 100)}%`}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              onPointerUp={() => playBuiltinSound('chime')}
              onKeyUp={() => playBuiltinSound('chime')}
              className="h-8 w-full cursor-pointer"
              aria-label="Volume"
            />
          </label>
          <p className="mt-2 text-xs text-slate-400">Applies to this display only: chimes, game sounds and the animal sounds in Learning.</p>
        </div>
      )}
    </div>
  );
}
