import { useState } from 'react';
import Modal from './Modal';
import { celebrate } from './celebrate';
import { SOUND_SLOTS, BUILTIN_SOUNDS, playSlotSound, playBuiltinSound } from './sounds';
import { GAME_TYPES, DEFAULT_CONFIG } from './miniGameCatalog';
import { playFor, previewFor } from './miniGamePreviews';

// Only the fields this panel's "Kiosk info" tab actually reads - narrower
// than the full DisplayConfig/ResolvedDisplayConfig so Display.tsx can pass
// either shape without a mismatch.
export interface KioskInfoConfig {
  name: string;
  theme: string;
  enabledFeatures: string[];
  soundEffects: boolean;
}

// Owner-only kiosk diagnostics/preview panel - everything Casey needed SSH
// + a CDP script to check by hand this session (does sound actually reach
// the speakers, does a game actually mount, does a completion celebration
// actually fire) is now a button press on the kiosk itself. No real data
// is touched anywhere in here - sounds/confetti fire standalone, and game
// previews use MiniGamePlayer's own no-stakes path (no grant/purchase row,
// no ledger entry, no real pool draw).
export default function KioskTestPanel({ config, onClose }: { config: KioskInfoConfig; onClose: () => void }) {
  const [tab, setTab] = useState<'sounds' | 'games' | 'info'>('sounds');
  const [previewing, setPreviewing] = useState<{ value: string; label: string; icon: string } | null>(null);

  return (
    <Modal
      maxWidthClass="max-w-2xl"
      onClose={onClose}
      header={<h3 className="text-lg font-semibold">🔧 Kiosk test panel</h3>}
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Close
          </button>
        </div>
      }
    >
      <div className="mb-3 flex gap-2 text-sm">
        {(['sounds', 'games', 'info'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 ${tab === t ? 'bg-slate-800 text-white' : 'border hover:bg-slate-50'}`}
          >
            {t === 'sounds' ? '🔊 Sounds' : t === 'games' ? '🎮 Games' : 'ℹ️ Kiosk info'}
          </button>
        ))}
      </div>

      {tab === 'sounds' && (
        <div className="flex flex-col gap-4">
          <div>
            <h4 className="mb-1 text-sm font-semibold">Test a completion (confetti + sound)</h4>
            <p className="mb-2 text-xs text-slate-400">
              Fires the exact same celebrate() call a real chore completion does - nothing is marked done, no data changes.
            </p>
            <button
              onClick={(e) => celebrate(e.currentTarget, 'choreCompleted')}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              🎉 Test completion
            </button>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold">This family's assigned sounds</h4>
            <p className="mb-2 text-xs text-slate-400">Plays whatever's actually assigned per slot in Settings - the real sound a kid would hear.</p>
            <ul className="flex flex-col gap-1.5">
              {SOUND_SLOTS.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs text-slate-400">{s.help}</div>
                  </div>
                  <button onClick={() => playSlotSound(s.id)} className="shrink-0 rounded border px-2.5 py-1 text-xs hover:bg-slate-50">
                    ▶ Play
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold">Every built-in sound</h4>
            <p className="mb-2 text-xs text-slate-400">Not tied to any slot - just to hear each option and confirm audio works at all.</p>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {BUILTIN_SOUNDS.map((s) => (
                <li key={s.id}>
                  <button onClick={() => playBuiltinSound(s.id)} className="w-full rounded border px-2.5 py-1.5 text-left text-xs hover:bg-slate-50">
                    ▶ {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'games' && !previewing && (
        <div>
          <p className="mb-2 text-xs text-slate-400">No tokens, no prize, no grant or purchase used - just trying each game out.</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GAME_TYPES.map((g) => (
              <li key={g.value}>
                <button
                  onClick={() => setPreviewing(g)}
                  className="flex w-full flex-col items-center gap-1 rounded-lg border p-3 text-center hover:bg-slate-50"
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span className="text-xs font-medium">{g.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === 'games' && previewing && (
        <GamePreview
          gameType={previewing.value}
          label={previewing.label}
          icon={previewing.icon}
          onBack={() => setPreviewing(null)}
        />
      )}

      {tab === 'info' && (
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Display name" value={config.name || '(unnamed)'} />
          <Row label="Theme" value={config.theme} />
          <Row label="Enabled features" value={config.enabledFeatures.length ? config.enabledFeatures.join(', ') : '(none)'} />
          <Row label="Sound effects" value={config.soundEffects === false ? 'Off' : 'On'} />
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border p-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// One game's no-stakes preview - idle animation up front, then Play mounts
// the real component fed default settings. Same "not ported yet" fallback
// language as MiniGamesTab's own PreviewModal for anything without a real
// component (shouldn't happen anymore - all ten are ported - but honest if
// an eleventh game ever lands here before its own port does).
function GamePreview({ gameType, label, icon, onBack }: { gameType: string; label: string; icon: string; onBack: () => void }) {
  const [key, setKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<{ won: boolean } | null>(null);
  const Play = playFor(gameType);
  const Preview = previewFor(gameType);
  const config = DEFAULT_CONFIG[gameType] ?? {};

  return (
    <div className="flex flex-col gap-3">
      <button onClick={onBack} className="self-start text-xs text-slate-500 hover:text-slate-700">
        ← Back to games
      </button>
      <h4 className="text-sm font-semibold">
        {icon} {label}
      </h4>
      {!Play ? (
        <p className="rounded border p-6 text-center text-sm text-slate-500">{label} hasn't been ported into the real app yet.</p>
      ) : result ? (
        <div className="flex flex-col items-center gap-3 rounded border bg-white p-6 text-center">
          <div className="text-xl font-bold" style={{ color: result.won ? '#16a34a' : '#dc2626' }}>
            {result.won ? 'Would have won!' : 'Would have lost.'}
          </div>
          <button
            onClick={() => {
              setResult(null);
              setPlaying(false);
              setKey((k) => k + 1);
            }}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Play again
          </button>
        </div>
      ) : playing ? (
        <Play key={key} config={config} onFinish={(r) => setResult({ won: r.won })} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          {Preview ? (
            <div className="w-full max-w-sm overflow-hidden rounded-xl">
              <Preview />
            </div>
          ) : (
            <div className="py-10 text-5xl">{icon}</div>
          )}
          <button onClick={() => setPlaying(true)} className="rounded-lg bg-amber-500 px-5 py-2 font-semibold text-white hover:bg-amber-600">
            Start
          </button>
        </div>
      )}
    </div>
  );
}
