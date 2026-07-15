import { useCallback, useEffect, useState } from 'react';
import { prizeClient, type PrizeClient, type Redemption } from './api';
import { useDialog } from './Dialog';

type Actor = { id: string; role: string; displayName: string };

// Kiosk feature-parity piece: PIN self-service + purchase history, the same
// two things a person could do from their own profile page on the portal,
// surfaced right on the touch display instead of needing a phone.
export default function KioskAccountPanel({ me, client: clientProp }: { me: Actor; client?: PrizeClient }) {
  const client = clientProp ?? prizeClient();
  const { alert } = useDialog();
  const [hasPin, setHasPin] = useState(false);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [settingPin, setSettingPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [users, redemptions] = await Promise.all([
      client.listUsers().catch(() => []),
      client.redemptions(me.id).catch(() => []),
    ]);
    setHasPin(!!users.find((u) => u.id === me.id)?.hasPin);
    setHistory(redemptions);
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
    } catch {
      setPinError('Could not save PIN — try again.');
    }
  }

  async function clearPin() {
    try {
      await client.setPin(me.id, null);
      await refresh();
    } catch {
      await alert('Could not clear PIN.');
    }
  }

  return (
    <section className="mt-4 space-y-3">
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

      {history.length > 0 && (
        <div className="rounded-lg border bg-white p-3">
          <h3 className="text-sm font-semibold">My purchases</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {history.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                <span className="min-w-0 flex-1 truncate">{r.prize.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{r.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
