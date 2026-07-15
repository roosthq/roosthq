import { useEffect, useState } from 'react';
import { api, type Me, type Member, type InviteInfo } from './api';

// Adults and the owner can invite people and manage PINs; only the owner can
// change roles or remove members, and only the owner can manage another
// adult's PIN — adults may only manage their own PIN and any kid's.
export default function MembersManager({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const canManagePin = (m: Member) => m.id === me.id || isOwner || m.role === 'KID';
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADULT' | 'KID'>('KID');
  const [freshInviteUrl, setFreshInviteUrl] = useState<string | null>(null);

  async function refresh() {
    const [m, inv] = await Promise.all([api.listUsers(), api.listInvites()]);
    setMembers(m);
    setInvites(inv);
  }
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function createInvite() {
    const minted = await api.createInvite(inviteRole);
    setFreshInviteUrl(`${window.location.origin}/?invite=${minted.token}`);
    await refresh();
  }
  async function revokeInvite(id: string) {
    await api.revokeInvite(id);
    await refresh();
  }
  async function changeRole(m: Member, role: 'ADULT' | 'KID') {
    await api.setUserRole(m.id, role);
    await refresh();
  }
  async function removeMember(m: Member) {
    if (!window.confirm(`Remove ${m.displayName}? This deletes their chores and token history.`)) return;
    await api.removeUser(m.id);
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

      {/* Invite */}
      <div className="mt-3 rounded bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Invite someone as</span>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'ADULT' | 'KID')}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="KID">Kid</option>
            <option value="ADULT">Adult</option>
          </select>
          <button onClick={createInvite} className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700">
            Generate invite link
          </button>
        </div>
        {freshInviteUrl && (
          <div className="mt-2 rounded bg-amber-50 p-2 text-xs">
            <p className="mb-1 font-medium text-amber-700">
              Send this link to the family member. They open it, sign in with Google, and join. One-time use:
            </p>
            <code className="block break-all rounded bg-white p-2">{freshInviteUrl}</code>
          </div>
        )}
        {invites.filter((i) => !i.acceptedAt).length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {invites
              .filter((i) => !i.acceptedAt)
              .map((i) => (
                <li key={i.id} className="flex items-center justify-between">
                  <span>
                    Pending invite · {String(i.role).toLowerCase()} · {new Date(i.createdAt).toLocaleDateString()}
                  </span>
                  <button onClick={() => revokeInvite(i.id)} className="text-red-500 hover:text-red-700">
                    Revoke
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-b pb-2">
            <span className="min-w-32 font-medium">{m.displayName}</span>

            {m.role === 'OWNER' ? (
              <span className="text-xs text-slate-400">owner</span>
            ) : isOwner ? (
              <select
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value as 'ADULT' | 'KID')}
                className="rounded border px-2 py-1 text-xs"
              >
                <option value="ADULT">Adult</option>
                <option value="KID">Kid</option>
              </select>
            ) : (
              <span className="text-xs text-slate-400">{m.role.toLowerCase()}</span>
            )}

            <span className="text-xs text-slate-400">{m.hasPin ? '🔒 PIN set' : 'no PIN'}</span>

            {canManagePin(m) && (
              <>
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
              </>
            )}
            {m.role !== 'KID' && !m.hasPin && (
              <span className="text-xs text-amber-600">needs a PIN for kiosk</span>
            )}
            {isOwner && m.role !== 'OWNER' && (
              <button onClick={() => removeMember(m)} className="ml-auto text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="text-slate-400">No members yet.</li>}
      </ul>

      {pinFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center">
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
