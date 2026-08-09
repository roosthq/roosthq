import { useCallback, useEffect, useState } from 'react';
import { prizeClient, COLOR_THEMES, type PrizeClient } from './api';
import { useDialog } from './Dialog';

type Actor = { id: string; role: string; displayName: string };

// Kiosk feature-parity piece: self-service PIN + micro-theme, the same thing a
// person could do from their own profile page on the portal, surfaced right on
// the touch display instead of needing a phone.
export default function KioskAccountPanel({
  me,
  client: clientProp,
  onPinChanged,
  onColorThemeChanged,
}: {
  me: Actor;
  client?: PrizeClient;
  // Lets the parent (the profile picker) refresh its stale "has a PIN" flag
  // for this person right away, instead of only on the next full members fetch.
  onPinChanged?: () => void;
  // Lets the parent apply the new theme to the kiosk immediately, instead of
  // waiting for the next unlock to pick it up.
  onColorThemeChanged?: (colorTheme: string) => void;
}) {
  const client = clientProp ?? prizeClient();
  const { alert } = useDialog();
  const [hasPin, setHasPin] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [colorTheme, setColorTheme] = useState('meadow');

  const refresh = useCallback(async () => {
    const users = await client.listUsers().catch(() => []);
    const self = users.find((u) => u.id === me.id);
    setHasPin(!!self?.hasPin);
    setColorTheme(self?.colorTheme || 'meadow');
  }, [client, me.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function savePin() {
    try {
      await client.setPin(me.id, pin || null);
      setSettingPin(false);
      setPin('');
      setPinError(null);
      await refresh();
      onPinChanged?.();
    } catch {
      setPinError('Could not save PIN - try again.');
    }
  }

  async function clearPin() {
    try {
      await client.setPin(me.id, null);
      await refresh();
      onPinChanged?.();
    } catch {
      await alert('Could not clear PIN.');
    }
  }

  async function pickColorTheme(id: string) {
    setColorTheme(id);
    onColorThemeChanged?.(id);
    try {
      await client.setColorTheme(id);
    } catch {
      await alert('Could not save color - try again.');
      await refresh();
    }
  }

  return (
    <section className="mt-4 space-y-3">
      <div className="rounded-lg border bg-white p-3">
        <h3 className="text-sm font-semibold">My Theme</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOR_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => pickColorTheme(t.id)}
              title={t.label}
              aria-label={t.label}
              className="h-8 w-8 rounded-full border-2"
              style={{ background: t.swatch, borderColor: colorTheme === t.id ? 'var(--text)' : 'transparent' }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-3">
        <h3 className="text-sm font-semibold">My PIN</h3>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-slate-500">{hasPin ? '🔒 PIN set' : 'No PIN set'}</span>
          <button
            onClick={() => {
              setSettingPin(true);
              setPin('');
              setPinError(null);
            }}
            className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
          >
            {hasPin ? 'Change' : 'Set PIN'}
          </button>
          {hasPin && (
            <button onClick={clearPin} className="text-xs text-red-500 hover:text-red-700">
              Clear
            </button>
          )}
        </div>
      </div>

      {settingPin && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center">
            <h3 className="text-lg font-semibold">Your PIN</h3>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePin()}
              placeholder="4+ digits"
              className="mt-3 w-full rounded border px-3 py-2 text-center text-2xl tracking-widest"
            />
            {pinError && <p className="mt-2 text-sm text-red-500">{pinError}</p>}
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setSettingPin(false)} className="rounded border px-4 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={savePin} className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
