import { useEffect, useState } from 'react';
import { api, ROLE_ICON, ROLE_LABEL, type Me, type Member, type InviteInfo } from './api';
import { useDialog } from './Dialog';
import { formatDate } from './dateFormat';

// Adults, family managers, and the owner can invite people and manage PINs;
// only the owner/family manager can change roles or remove members, and only
// the owner/family manager can manage another adult's PIN — plain adults may
// only manage their own PIN and any kid's. Resetting history follows the
// same shape: yourself always, any kid, but another adult or a manager-tier
// account only if you're the owner or a family manager yourself. The owner
// account itself is protected from role changes/removal here — that's a
// deliberate separate flow, not a quick dropdown pick.
export default function MembersManager({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const isFamilyManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const canManagePin = (m: Member) => m.id === me.id || isFamilyManager || m.role === 'KID';
  const canReset = (m: Member) => m.id === me.id || m.role === 'KID' || isFamilyManager;
  // Mirrors UsersService.setTokensDisabled exactly — server re-checks this
  // too, but the row shouldn't even offer the control when it'd just 403.
  const canToggleTokens = (m: Member) =>
    isOwner ||
    (me.role === 'FAMILY_MANAGER' && (m.id === me.id || m.role === 'ADULT' || m.role === 'KID')) ||
    (me.role === 'ADULT' && m.role === 'KID');
  const { confirm } = useDialog();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'>('KID');
  const [freshInviteUrl, setFreshInviteUrl] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<'ADULT' | 'KID'>('KID');
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

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
  async function changeRole(m: Member, role: 'FAMILY_MANAGER' | 'ADULT' | 'KID') {
    await api.setUserRole(m.id, role);
    await refresh();
  }
  async function removeMember(m: Member) {
    const ok = await confirm(`Remove ${m.displayName}? This deletes their chores and token history.`, {
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
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
  async function toggleTokens(m: Member) {
    await api.setTokensDisabled(m.id, !m.tokensDisabled);
    await refresh();
  }
  async function addMember() {
    setAddError(null);
    setAddBusy(true);
    try {
      await api.createLocalMember({
        role: addRole,
        displayName: addName,
        email: addEmail || undefined,
        username: addUsername || undefined,
        password: addPassword || undefined,
      });
      setAddName('');
      setAddEmail('');
      setAddUsername('');
      setAddPassword('');
      await refresh();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAddBusy(false);
    }
  }
  async function resetAccount(m: Member) {
    const ok = await confirm(
      `Reset ${m.displayName}'s account? This permanently clears their token balance, full token history, purchase history, and notifications — it can't be undone. Their PIN, theme, text size, and other settings stay exactly as they are.`,
      { danger: true, confirmLabel: 'Reset' },
    );
    if (!ok) return;
    await api.resetUser(m.id);
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
      <div className="mt-3 rounded bg-slate-100 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Invite someone as</span>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID')}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="KID">Kid</option>
            <option value="ADULT">Adult</option>
            {isFamilyManager && <option value="FAMILY_MANAGER">Family Manager</option>}
            {isOwner && <option value="OWNER">Owner</option>}
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
                    Pending invite · {ROLE_LABEL[i.role] ?? i.role} · {formatDate(i.createdAt)}
                  </span>
                  <button onClick={() => revokeInvite(i.id)} className="text-red-500 hover:text-red-700">
                    Revoke
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Add directly — no invite link, no Google needed */}
      <div className="mt-3 rounded bg-slate-100 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Or add someone directly as</span>
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as 'ADULT' | 'KID')}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="KID">Kid</option>
            <option value="ADULT">Adult</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Name"
            className="rounded border px-2 py-1 text-xs"
          />
          <input
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder={addRole === 'ADULT' ? 'Email (required)' : 'Email (optional)'}
            className="rounded border px-2 py-1 text-xs"
          />
          <input
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            placeholder="Username (optional)"
            className="rounded border px-2 py-1 text-xs"
          />
          <input
            type="password"
            value={addPassword}
            onChange={(e) => setAddPassword(e.target.value)}
            placeholder="Password (optional, for login)"
            className="rounded border px-2 py-1 text-xs"
          />
          <button
            onClick={addMember}
            disabled={addBusy || !addName}
            className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {addError && <p className="mt-1 text-xs text-red-500">{addError}</p>}
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-b pb-2">
            <span className="min-w-32 font-medium">{m.displayName}</span>

            {m.role === 'OWNER' ? (
              <span className="text-xs text-slate-400">{ROLE_ICON.OWNER} {ROLE_LABEL.OWNER}</span>
            ) : isFamilyManager ? (
              <span className="flex items-center gap-1 text-xs">
                {ROLE_ICON[m.role]}
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m, e.target.value as 'FAMILY_MANAGER' | 'ADULT' | 'KID')}
                  className="rounded border px-2 py-1 text-xs"
                >
                  <option value="FAMILY_MANAGER">Family Manager</option>
                  <option value="ADULT">Adult</option>
                  <option value="KID">Kid</option>
                </select>
              </span>
            ) : (
              <span className="text-xs text-slate-400">{ROLE_ICON[m.role]} {ROLE_LABEL[m.role] ?? m.role}</span>
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
            {canToggleTokens(m) && (
              <label className="flex items-center gap-1 text-xs text-slate-500" title="When off: chores/awards still work, just never give tokens, and this person's token info is hidden">
                <input type="checkbox" checked={!m.tokensDisabled} onChange={() => toggleTokens(m)} />
                Tokens
              </label>
            )}
            <span className="ml-auto flex items-center gap-3">
              {canReset(m) && (
                <button onClick={() => resetAccount(m)} className="text-xs text-amber-600 hover:text-amber-800">
                  Reset
                </button>
              )}
              {isFamilyManager && m.role !== 'OWNER' && (
                <button onClick={() => removeMember(m)} className="text-xs text-red-500 hover:text-red-700">
                  Remove
                </button>
              )}
            </span>
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
