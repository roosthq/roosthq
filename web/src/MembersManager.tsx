import { useEffect, useState } from 'react';
import { api, KID_PERMISSIONS, ROLE_ICON, ROLE_SLOT, ROLE_LABEL, type Me, type Member, type InviteInfo } from './api';
import InviteLinkBox from './InviteLinkBox';
import { useDialog } from './Dialog';
import { formatDate } from './dateFormat';
import LucideIcon from './LucideIcon';

// Adults, family managers, and the owner can invite people and manage PINs;
// only the owner/family manager can change roles or remove members, and only
// the owner/family manager can manage another adult's PIN - plain adults may
// only manage their own PIN and any kid's. Resetting history follows the
// same shape: yourself always, any kid, but another adult or a manager-tier
// account only if you're the owner or a family manager yourself. The owner
// account itself is protected from role changes/removal here - that's a
// deliberate separate flow, not a quick dropdown pick.
export default function MembersManager({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const isFamilyManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const canManagePin = (m: Member) => m.id === me.id || isFamilyManager || m.role === 'KID';
  const canReset = (m: Member) => m.id === me.id || m.role === 'KID' || isFamilyManager;
  // Mirrors UsersService.setTokensDisabled exactly - server re-checks this
  // too, but the row shouldn't even offer the control when it'd just 403.
  const canToggleTokens = (m: Member) =>
    isOwner ||
    (me.role === 'FAMILY_MANAGER' && (m.id === me.id || m.role === 'ADULT' || m.role === 'KID')) ||
    (me.role === 'ADULT' && m.role === 'KID');
  const { confirm } = useDialog();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [pin, setPin] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'>('KID');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; id: string; sentTo?: string } | null>(null);
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
  // Reveal button removed (nav reorg, 2026-08) - this now has its own
  // dedicated "People & PINs" tab in Family Settings, which is already the
  // disclosure step; a second collapse on top of that was double-clicking to
  // see the same thing.
  useEffect(() => {
    refresh();
  }, []);

  // Primary path: type an email, pick a role, send - one action, not
  // "generate a link, then separately remember to email it."
  async function sendInviteEmail() {
    setInviteBusy(true);
    setInviteError(null);
    try {
      const minted = await api.createInvite(inviteRole, { email: inviteEmail.trim() });
      setFresh({ url: `${window.location.origin}/?invite=${minted.token}`, id: minted.id, sentTo: minted.sentTo });
      setInviteEmail('');
      await refresh();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not send that invite.');
    } finally {
      setInviteBusy(false);
    }
  }
  // Alternative path: no email needed - just mint a link to share yourself
  // (text, Slack, whatever). Whatever's in the email field is ignored here.
  async function generateInviteLink() {
    setInviteBusy(true);
    setInviteError(null);
    try {
      const minted = await api.createInvite(inviteRole);
      setFresh({ url: `${window.location.origin}/?invite=${minted.token}`, id: minted.id });
      await refresh();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not create that invite.');
    } finally {
      setInviteBusy(false);
    }
  }
  async function revokeInvite(id: string) {
    await api.revokeInvite(id);
    await refresh();
  }
  // Only the hash is ever stored server-side, so a link closed/lost after
  // creation can't be shown again - this mints a fresh one (same role/label,
  // old one revoked) and reuses the exact same reveal-it box, so copy/email
  // both work on the new link right away.
  async function regenerateInvite(id: string) {
    const minted = await api.regenerateInvite(id);
    setFresh({ url: `${window.location.origin}/?invite=${minted.token}`, id: minted.id });
    await refresh();
  }
  async function resendPending(id: string) {
    await api.resendInvite(id);
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
  async function togglePinDisabled(m: Member) {
    await api.setPinDisabled(m.id, !m.pinDisabled);
    await refresh();
  }
  async function toggleTokens(m: Member) {
    await api.setTokensDisabled(m.id, !m.tokensDisabled);
    await refresh();
  }
  async function toggleSimple(m: Member) {
    await api.setMemberPrefs(m.id, { simpleMode: !m.simpleMode });
    await refresh();
  }
  async function setAllowance(m: Member, v: number) {
    await api.setMemberPrefs(m.id, { allowanceTokens: v });
    await refresh();
  }
  async function setBirthday(m: Member, v: string) {
    await api.setMemberPrefs(m.id, { birthday: v || null });
    await refresh();
  }
  async function togglePermission(m: Member, permission: string, allowed: boolean) {
    const disabled = new Set(m.disabledPermissions ?? []);
    if (allowed) disabled.delete(permission);
    else disabled.add(permission);
    await api.setMemberPrefs(m.id, { disabledPermissions: [...disabled] });
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
      `Reset ${m.displayName}'s account? This permanently clears their token balance, full token history, purchase history, and notifications - it can't be undone. Their PIN, theme, text size, and other settings stay exactly as they are.`,
      { danger: true, confirmLabel: 'Reset' },
    );
    if (!ok) return;
    await api.resetUser(m.id);
    await refresh();
  }

  return (
    <>
      <div className="panel">
        <h3 className="text-base font-semibold tracking-tight">Add people</h3>
        <p className="mt-1 text-sm text-slate-500">Email someone an invite, generate a link to share yourself, or add a local account directly - no invite needed.</p>

      {/* Invite */}
      <div className="mt-3 card-nested rounded-lg p-3">
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
        </div>
        {/* Email is the primary path - type an address, pick a role above,
            send. Stacked on a phone, same reasoning as InviteLinkBox's own
            email row. */}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Their email address"
            className="w-full min-w-0 rounded border px-2 py-1.5 text-sm"
          />
          <button
            onClick={sendInviteEmail}
            disabled={inviteBusy || !inviteEmail.trim()}
            className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50 sm:w-auto"
          >
            {inviteBusy ? 'Sending…' : '✉️ Send invite'}
          </button>
        </div>
        <button onClick={generateInviteLink} disabled={inviteBusy} className="mt-1.5 text-xs text-slate-500 underline hover:text-slate-800 disabled:opacity-50">
          Or just generate a link to share yourself
        </button>
        {inviteError && <p className="mt-1 text-xs text-red-600">{inviteError}</p>}
        {fresh && <InviteLinkBox url={fresh.url} id={fresh.id} sentTo={fresh.sentTo} />}
        {invites.filter((i) => !i.acceptedAt).length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {invites
              .filter((i) => !i.acceptedAt)
              .map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>
                    Pending invite · {ROLE_LABEL[i.role] ?? i.role}
                    {i.email && <> · {i.email}</>} · {formatDate(i.createdAt)}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {i.email && (
                      <button onClick={() => resendPending(i.id)} className="text-slate-500 hover:text-slate-800" title={`Resend to ${i.email}`}>
                        ✉️ Resend
                      </button>
                    )}
                    <button
                      onClick={() => regenerateInvite(i.id)}
                      className="text-slate-500 hover:text-slate-800"
                      title="Lost the link, or want the link without re-emailing? Mints a fresh one and revokes this one."
                    >
                      🔁 Get link
                    </button>
                    <button onClick={() => revokeInvite(i.id)} className="text-red-500 hover:text-red-700">
                      Revoke
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Add directly - no invite link, no Google needed */}
      <div className="mt-3 card-nested rounded-lg p-3">
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
      </div>

      {/* One card per person: name + role header, then labeled settings in a
          grid that stacks on a phone and goes two-up once there's room, then
          the destructive actions on their own line. The old version was a
          single wrapped row of a dozen unlabeled controls - unreadable on
          anything narrow. card-nested, same as every other sub-card in the
          app (Starter packs, Locations, Holidays, ...) - member cards used
          to be their own separate card-tinted treatment, which just read as
          a mismatched, different-colored block next to everything else. */}
      <div className="panel mt-4">
        <h3 className="text-base font-semibold tracking-tight">People</h3>
        <ul className="mt-3 space-y-3 text-sm">
        {members.map((m) => (
          <li key={m.id} className="card-nested rounded-lg p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.displayName}</span>
              {m.role === 'OWNER' ? (
                <span className="text-xs text-slate-400">
                  <LucideIcon name={ROLE_ICON.OWNER} slot={ROLE_SLOT.OWNER} size={12} /> {ROLE_LABEL.OWNER}
                </span>
              ) : isFamilyManager ? (
                <span className="flex items-center gap-1 text-xs">
                  <LucideIcon name={ROLE_ICON[m.role]} slot={ROLE_SLOT[m.role]} size={12} />
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
                <span className="text-xs text-slate-400">
                  <LucideIcon name={ROLE_ICON[m.role]} slot={ROLE_SLOT[m.role]} size={12} /> {ROLE_LABEL[m.role] ?? m.role}
                </span>
              )}
              {m.role !== 'KID' && !m.hasPin && <span className="text-xs text-amber-600">needs a PIN for kiosk</span>}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-slate-500">Kiosk PIN</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {m.pinDisabled ? 'turned off' : m.hasPin ? '🔒 set' : 'not set'}
                  </span>
                  {canManagePin(m) && !m.pinDisabled && (
                    <>
                      <button
                        onClick={() => {
                          setPinFor(m);
                          setPin('');
                        }}
                        className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        {m.hasPin ? 'Change' : 'Set'}
                      </button>
                      {m.hasPin && (
                        <button onClick={() => clearPin(m)} className="text-xs text-red-500 hover:text-red-700">
                          Clear
                        </button>
                      )}
                    </>
                  )}
                </div>
                {/* Kid-only master switch: not "excuse them from re-entering
                    it" but "nobody can give this kid a PIN at all" - turning
                    it on clears whatever PIN existed and hides Set/Change
                    above. Doesn't apply to adults, whose PIN is a real kiosk
                    security boundary, not something to opt out of. */}
                {m.role === 'KID' && canManagePin(m) && (
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={!!m.pinDisabled} onChange={() => togglePinDisabled(m)} />
                    Don't let this kid have a kiosk PIN
                  </label>
                )}
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Birthday</div>
                <input
                  type="date"
                  defaultValue={m.birthday ?? ''}
                  onBlur={(e) => {
                    if ((e.target.value || '') !== (m.birthday ?? '')) setBirthday(m, e.target.value);
                  }}
                  className="mt-1 w-full rounded border px-2 py-1 text-xs"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Weekly allowance</div>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    defaultValue={m.allowanceTokens ?? 0}
                    onBlur={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      if (v !== (m.allowanceTokens ?? 0)) setAllowance(m, v);
                    }}
                    className="w-20 rounded border px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-slate-400">per week</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Options</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {canToggleTokens(m) && (
                    <label
                      className="flex items-center gap-1.5 text-xs text-slate-500"
                      title="When off: chores/awards still work, just never give tokens, and this person's token info is hidden"
                    >
                      <input type="checkbox" checked={!m.tokensDisabled} onChange={() => toggleTokens(m)} />
                      Earns tokens
                    </label>
                  )}
                  <label
                    className="flex items-center gap-1.5 text-xs text-slate-500"
                    title="My Day mode: giant, icon-first task view for pre-readers"
                  >
                    <input type="checkbox" checked={!!m.simpleMode} onChange={() => toggleSimple(m)} />
                    My Day view
                  </label>
                </div>
              </div>

              {m.role === 'KID' && (
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-slate-500">Allowed to</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {KID_PERMISSIONS.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={!(m.disabledPermissions ?? []).includes(perm.id)}
                          onChange={(e) => togglePermission(m, perm.id, e.target.checked)}
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(canReset(m) || (isFamilyManager && m.role !== 'OWNER')) && (
              <div className="mt-3 flex items-center gap-4 border-t pt-2">
                {canReset(m) && (
                  <button onClick={() => resetAccount(m)} className="text-xs text-amber-600 hover:text-amber-800">
                    Reset history
                  </button>
                )}
                {isFamilyManager && m.role !== 'OWNER' && (
                  <button onClick={() => removeMember(m)} className="text-xs text-red-500 hover:text-red-700">
                    Remove
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="text-slate-400">No members yet.</li>}
        </ul>
      </div>

      {pinFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-card w-full max-w-xs rounded-lg bg-white p-5 text-center">
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
    </>
  );
}
