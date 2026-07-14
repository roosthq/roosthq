import { useEffect, useState } from 'react';
import { api, type Member } from './api';

// Owner-only: manage family members — set roles (mark someone a kid) and manage the
// PINs used on the touch hub (adults require a PIN to act on the kiosk).
export default function MembersManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');

  async function refresh() {
    setMembers(await api.listUsers());
  }
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function changeRole(m: Member, role: 'ADULT' | 'KID') {
    await api.setUserRole(m.id, role);
    await refresh();
  }
  async function savePin() {
    if (!pinFor) return;
    await api.setUserPin(pinFor.id, pin || null);
    setPinFor(null);
    setPin('');
    await refresh();
  }
  async function clearPin(m: Member) {
    await api.setUserPin(m.id, null);
    await refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded border bg-white px-3 py-1 hover:bg-slate-100">
        Family &amp; PINs
      </button>
    );

  return (
    <div className="mt-2 w-full rounded border bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Family members</span>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-700">
          Close
        </button>
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-b pb-2">
            <span className="min-w-32 font-medium">{m.displayName}</span>

            {m.role === 'OWNER' ? (
              <span className="text-xs text-slate-400">owner</span>
            ) : (
              <select
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value as 'ADULT' | 'KID')}
                className="rounded border px-2 py-1 text-xs"
              >
                <option value="ADULT">Adult</option>
                <option value="KID">Kid</option>
              </select>
            )}

            <span className="text-xs text-slate-400">{m.hasPin ? '🔒 PIN set' : 'no PIN'}</span>

            <button
              onClick={() => {
                setPinFor(m);
                setPin('');
              }}
              className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
            >
              {m.hasPin ? 'Change PIN' : 'Set PIN'}
            </button>
            {m.hasPin && (
              <button onClick={() => clearPin(m)} className="text-xs text-red-500 hover:text-red-700">
                Clear
              </button>
            )}
            {m.role !== 'KID' && !m.hasPin && (
              <span className="text-xs text-amber-600">needs a PIN for kiosk</span>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="text-slate-400">No members yet.</li>}
      </ul>

      {pinFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={() => setPinFor(null)}>
          <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">PIN for {pinFor.displayName}</h3>
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
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setPinFor(null)} className="rounded border px-4 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={savePin} className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
