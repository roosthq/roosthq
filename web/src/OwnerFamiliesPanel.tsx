import { useCallback, useEffect, useState } from 'react';
import { api, ROLE_ICON, ROLE_SLOT, ROLE_LABEL, type FamilyInfo, type Member, type InviteInfo } from './api';
import { useDialog } from './Dialog';
import InviteLinkBox from './InviteLinkBox';
import { formatDate, formatDateTime } from './dateFormat';
import LucideIcon from './LucideIcon';
import { usePaginatedList } from './usePaginatedList';
import LoadMoreButton from './LoadMoreButton';
import PasswordInput from './PasswordInput';

// "user.deactivate" -> "deactivated". Covers every action string OwnerService
// actually writes; falls back to the raw dotted string for anything new so a
// forgotten label never renders as blank.
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'family.create': 'created family',
  'family.rename': 'renamed family',
  'family.delete': 'deleted family',
  'user.create': 'created account',
  'user.move': 'moved account',
  'user.deactivate': 'deactivated',
  'user.reactivate': 'reactivated',
  'user.delete': 'deleted account',
  'ghost.start': 'ghosted as',
};

// Instance-owner-only: create families, see who's in each, move a member
// between families (with a role for their new home), invite someone
// straight into a specific family, and ghost as anyone - to switch into
// another family's view or to see the app as a kid/adult would.
export default function OwnerFamiliesPanel() {
  const { confirm } = useDialog();
  const [families, setFamilies] = useState<FamilyInfo[]>([]);
  const [membersByFamily, setMembersByFamily] = useState<Record<string, Member[]>>({});
  const [invitesByFamily, setInvitesByFamily] = useState<Record<string, InviteInfo[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const auditPage = usePaginatedList(
    (skip) => (auditOpen ? api.auditLog(skip) : Promise.resolve({ items: [], hasMore: false })),
    [auditOpen],
  );

  const [moveTarget, setMoveTarget] = useState<Record<string, { userId: string; role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' }>>({});
  const [inviteRole, setInviteRole] = useState<Record<string, 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'>>({});
  const [fresh, setFresh] = useState<{ url: string; id: string } | null>(null);
  // Resend gave no visible feedback at all - the row looks the same either
  // way. Invite ids are unique instance-wide, so one flag works across
  // every family's list, same as busy/error above.
  const [justSentId, setJustSentId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // "Create an account here" form, per family - no invite, no Google needed.
  const [addForm, setAddForm] = useState<
    Record<
      string,
      { role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'; displayName: string; email: string; username: string; password: string }
    >
  >({});
  const blankAdd = { role: 'KID' as const, displayName: '', email: '', username: '', password: '' };
  const addFor = (familyId: string) => addForm[familyId] ?? blankAdd;
  const setAddFor = (familyId: string, patch: Partial<ReturnType<typeof addFor>>) =>
    setAddForm((prev) => ({ ...prev, [familyId]: { ...addFor(familyId), ...patch } }));

  const refresh = useCallback(async () => {
    const f = await api.listFamilies();
    setFamilies(f);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function loadMembers(familyId: string) {
    const m = await api.ownerFamilyMembers(familyId);
    setMembersByFamily((prev) => ({ ...prev, [familyId]: m }));
  }

  async function loadInvites(familyId: string) {
    const inv = await api.listInvitesForFamily(familyId);
    setInvitesByFamily((prev) => ({ ...prev, [familyId]: inv }));
  }

  async function toggleExpand(familyId: string) {
    if (expanded === familyId) {
      setExpanded(null);
      return;
    }
    setExpanded(familyId);
    if (!membersByFamily[familyId]) await loadMembers(familyId);
    if (!invitesByFamily[familyId]) await loadInvites(familyId);
  }

  // Every member across every family, for the "move someone here" picker -
  // fetched once per family the first time any section is expanded, so this
  // stays cheap for the handful of families a self-hosted instance has.
  const allMembers: Array<Member & { familyId: string; familyName: string }> = families.flatMap((f) =>
    (membersByFamily[f.id] ?? []).map((m) => ({ ...m, familyId: f.id, familyName: f.name })),
  );

  async function addFamily() {
    if (!newFamilyName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createFamily(newFamilyName.trim());
      setNewFamilyName('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveHere(familyId: string) {
    const target = moveTarget[familyId];
    if (!target?.userId) return;
    setBusy(true);
    setError(null);
    try {
      await api.moveUser(target.userId, familyId, target.role);
      // The member's old family's member list is now stale too - drop both.
      setMembersByFamily((prev) => {
        const next = { ...prev };
        delete next[familyId];
        for (const key of Object.keys(next)) delete next[key];
        return next;
      });
      await refresh();
      await loadMembers(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inviteToFamily(familyId: string) {
    const role = inviteRole[familyId] ?? 'KID';
    setBusy(true);
    setError(null);
    try {
      const minted = await api.createInvite(role, { familyId });
      setFresh({ url: `${window.location.origin}/?invite=${minted.token}`, id: minted.id });
      // The transient box above shows the just-minted link/email result, but
      // it disappears once you mint another one (or navigate away and back)
      // with no other record of it - the whole point of this ask was "show
      // me who I've already invited", so the persistent list needs it too.
      await loadInvites(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Same three actions as MembersManager's own pending-invite list - resend
  // reuses whatever address is already on file, "get link" mints a fresh
  // token without emailing (only the hash is ever stored, so a closed/lost
  // link can't just be shown again), revoke kills it outright.
  // Resend swaps the invite for a fresh one server-side (only the hash is
  // ever stored, same reason regenerate mints a new one too), so the row's
  // OWN id changes - track the NEW id from the response, not the one that
  // was clicked, or "just sent" would point at a row that no longer exists
  // once loadInvites() replaces it.
  async function resendPendingInvite(familyId: string, id: string) {
    setBusy(true);
    setError(null);
    setJustSentId(null);
    setResendingId(id);
    try {
      const r = await api.resendInvite(id);
      await loadInvites(familyId);
      setJustSentId(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setResendingId(null);
    }
  }

  async function regeneratePendingInvite(familyId: string, id: string) {
    setBusy(true);
    setError(null);
    try {
      const minted = await api.regenerateInvite(id);
      setFresh({ url: `${window.location.origin}/?invite=${minted.token}`, id: minted.id });
      await loadInvites(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revokePendingInvite(familyId: string, id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.revokeInvite(id);
      await loadInvites(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    if (!renaming || !renaming.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.renameFamily(renaming.id, renaming.name.trim());
      setRenaming(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteFamily(f: FamilyInfo) {
    if (!(await confirm(`Delete "${f.name}"? This can't be undone.`, { danger: true, confirmLabel: 'Delete' }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteFamily(f.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createUser(familyId: string) {
    const form = addFor(familyId);
    if (!form.displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.ownerCreateUser({
        familyId,
        role: form.role,
        displayName: form.displayName.trim(),
        email: form.email.trim() || undefined,
        username: form.username.trim() || undefined,
        password: form.password || undefined,
      });
      setAddForm((prev) => ({ ...prev, [familyId]: blankAdd }));
      await refresh();
      await loadMembers(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Deactivating is the reversible option: they keep every row of history but
  // cannot use the app. Only the turning-off direction needs a confirm.
  async function toggleActive(familyId: string, m: Member) {
    const turningOff = m.active !== false;
    if (turningOff) {
      const ok = await confirm(
        `Deactivate ${m.displayName}? They stay in the family and keep all their history, but cannot sign in or use the app until you turn them back on.`,
        { danger: true, confirmLabel: 'Deactivate' },
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.ownerSetUserActive(m.id, !turningOff);
      await loadMembers(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(familyId: string, m: Member) {
    const ok = await confirm(
      `Permanently delete ${m.displayName}? Their chores, tokens, awards, and history go with them. This cannot be undone - deactivating instead keeps everything.`,
      { danger: true, confirmLabel: 'Delete forever' },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.ownerDeleteUser(m.id);
      await refresh();
      await loadMembers(familyId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function ghostAs(m: Member) {
    const ok = await confirm(`Ghost as ${m.displayName}? You'll see the app exactly as they do until you return.`, {
      confirmLabel: 'Ghost',
    });
    if (!ok) return;
    await api.ghost(m.id);
    window.location.href = '/';
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap gap-2">
          <input
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addFamily()}
            placeholder="e.g. Jessen Family"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <button disabled={busy} onClick={addFamily} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            Add family
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>

      {fresh && <InviteLinkBox url={fresh.url} id={fresh.id} />}

      <ul className="space-y-2">
        {families.map((f) => {
          const members = membersByFamily[f.id];
          const isOpen = expanded === f.id;
          const movable = allMembers.filter((m) => m.familyId !== f.id && m.role !== 'OWNER');
          return (
            <li key={f.id} className="card-nested rounded-lg">
              {renaming?.id === f.id ? (
                <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="min-w-0 flex-1 rounded border px-2 py-1"
                  />
                  <button
                    disabled={busy || !renaming.name.trim()}
                    onClick={saveRename}
                    className="rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button onClick={() => setRenaming(null)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <button onClick={() => toggleExpand(f.id)} className="min-w-0 flex-1 break-words text-left font-medium hover:underline">
                    {f.name}
                  </button>
                  <button
                    onClick={() => setRenaming({ id: f.id, name: f.name })}
                    className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
                    title="Rename family"
                  >
                    ✏️
                  </button>
                  {f.memberCount === 0 && (
                    <button
                      disabled={busy}
                      onClick={() => deleteFamily(f)}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                  <button onClick={() => toggleExpand(f.id)} className="shrink-0 text-xs text-slate-400 hover:text-slate-600">
                    {f.memberCount} member{f.memberCount === 1 ? '' : 's'} {isOpen ? '▴' : '▾'}
                  </button>
                </div>
              )}
              {isOpen && (
                <div className="space-y-3 border-t p-3">
                  {/* One card per member: name/role on its own line, controls
                      wrapped beneath, so three buttons still fit a phone. */}
                  <ul className="space-y-2">
                    {members?.map((m) => (
                      <li key={m.id} className="card-nested rounded-lg p-2 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <LucideIcon name={ROLE_ICON[m.role]} slot={ROLE_SLOT[m.role]} size={14} />
                          <span className="min-w-0 flex-1 break-words font-medium">{m.displayName}</span>
                          {m.active === false && (
                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Deactivated
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 break-words text-xs text-slate-500">
                          {ROLE_LABEL[m.role] ?? m.role}
                          {m.email ? ` · ${m.email}` : m.username ? ` · @${m.username}` : ''}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <button onClick={() => ghostAs(m)} className="rounded border px-2 py-1 hover:bg-slate-50">
                            👻 Ghost as
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => toggleActive(f.id, m)}
                            className="rounded border px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {m.active === false ? '✅ Reactivate' : '🚫 Deactivate'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => deleteUser(f.id, m)}
                            className="btn-delete rounded px-2 py-1 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                    {members?.length === 0 && <li className="text-xs text-slate-500">No members yet.</li>}
                  </ul>

                  {/* Create an account outright - the owner-side equivalent of
                      Settings > add-directly, for any family and any role. */}
                  <div className="card-nested rounded-lg p-3">
                    <p className="text-xs font-medium">Create an account in this family</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      <select
                        value={addFor(f.id).role}
                        onChange={(e) => setAddFor(f.id, { role: e.target.value as 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' })}
                        className="w-full rounded border px-2 py-1.5"
                      >
                        <option value="KID">Kid</option>
                        <option value="ADULT">Adult</option>
                        <option value="FAMILY_MANAGER">Family Manager</option>
                        <option value="OWNER">Owner</option>
                      </select>
                      <input
                        value={addFor(f.id).displayName}
                        onChange={(e) => setAddFor(f.id, { displayName: e.target.value })}
                        placeholder="Name (required)"
                        className="w-full min-w-0 rounded border px-2 py-1.5"
                      />
                      <input
                        value={addFor(f.id).email}
                        onChange={(e) => setAddFor(f.id, { email: e.target.value })}
                        placeholder={addFor(f.id).role === 'KID' ? 'Email (optional)' : 'Email'}
                        className="w-full min-w-0 rounded border px-2 py-1.5"
                      />
                      <input
                        value={addFor(f.id).username}
                        onChange={(e) => setAddFor(f.id, { username: e.target.value })}
                        placeholder="Username (optional)"
                        className="w-full min-w-0 rounded border px-2 py-1.5"
                      />
                      <PasswordInput
                        value={addFor(f.id).password}
                        onChange={(e) => setAddFor(f.id, { password: e.target.value })}
                        placeholder="Password (optional, 8+)"
                        className="w-full min-w-0 rounded border px-2 py-1.5"
                        wrapperClassName="sm:col-span-2"
                      />
                      <button
                        disabled={busy || !addFor(f.id).displayName.trim()}
                        onClick={() => createUser(f.id)}
                        className="w-full rounded bg-slate-800 px-3 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50 sm:col-span-2"
                      >
                        Create account
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      No invite, no email sent. A grown-up needs an email or a username so they have something to sign in with.
                    </p>
                  </div>

                  <div className="card-nested rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">Move someone here as</span>
                      <select
                        value={moveTarget[f.id]?.userId ?? ''}
                        onChange={(e) =>
                          setMoveTarget((prev) => ({ ...prev, [f.id]: { userId: e.target.value, role: prev[f.id]?.role ?? 'ADULT' } }))
                        }
                        className="w-full min-w-0 rounded border px-2 py-1.5 sm:w-auto"
                      >
                        <option value="">Pick a member…</option>
                        {movable.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName} ({m.familyName})
                          </option>
                        ))}
                      </select>
                      <select
                        value={moveTarget[f.id]?.role ?? 'ADULT'}
                        onChange={(e) =>
                          setMoveTarget((prev) => ({ ...prev, [f.id]: { userId: prev[f.id]?.userId ?? '', role: e.target.value as 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' } }))
                        }
                        className="w-full min-w-0 rounded border px-2 py-1.5 sm:w-auto"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="FAMILY_MANAGER">Family Manager</option>
                        <option value="ADULT">Adult</option>
                        <option value="KID">Kid</option>
                      </select>
                      <button
                        disabled={busy || !moveTarget[f.id]?.userId}
                        onClick={() => moveHere(f.id)}
                        className="rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        Move
                      </button>
                    </div>
                    {allMembers.length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">Expand another family first to see members to move.</p>
                    )}
                  </div>

                  <div className="card-nested rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">Invite someone to this family as</span>
                      <select
                        value={inviteRole[f.id] ?? 'KID'}
                        onChange={(e) => setInviteRole((prev) => ({ ...prev, [f.id]: e.target.value as 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' }))}
                        className="w-full min-w-0 rounded border px-2 py-1.5 sm:w-auto"
                      >
                        <option value="KID">Kid</option>
                        <option value="ADULT">Adult</option>
                        <option value="FAMILY_MANAGER">Family Manager</option>
                        <option value="OWNER">Owner</option>
                      </select>
                      <button
                        disabled={busy}
                        onClick={() => inviteToFamily(f.id)}
                        className="w-full rounded bg-slate-800 px-3 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50 sm:w-auto"
                      >
                        Generate invite link
                      </button>
                    </div>
                    {/* Who's already been invited and is still waiting -
                        same three actions (resend/get link/revoke) as
                        MembersManager's own pending list, since without
                        this there was no way to see a link/email you'd
                        already sent, or that one existed at all, once the
                        fresh-mint box above disappeared. */}
                    {(invitesByFamily[f.id] ?? []).filter((i) => !i.acceptedAt).length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t pt-2 text-xs">
                        {(invitesByFamily[f.id] ?? [])
                          .filter((i) => !i.acceptedAt)
                          .map((i) => (
                            <li key={i.id} className="flex flex-col gap-1">
                              <span className="break-words">
                                Pending invite · {ROLE_LABEL[i.role] ?? i.role}
                                {i.email && <> · {i.email}</>} · {formatDate(i.createdAt)}
                              </span>
                              <span className="flex flex-wrap items-center gap-3">
                                {i.email && (
                                  <button
                                    disabled={busy}
                                    onClick={() => resendPendingInvite(f.id, i.id)}
                                    className="text-slate-500 hover:text-slate-800 disabled:opacity-50"
                                    title={`Resend to ${i.email}`}
                                  >
                                    {resendingId === i.id ? 'Sending…' : '✉️ Resend'}
                                  </button>
                                )}
                                <button
                                  disabled={busy}
                                  onClick={() => regeneratePendingInvite(f.id, i.id)}
                                  className="text-slate-500 hover:text-slate-800 disabled:opacity-50"
                                  title="Lost the link, or want the link without re-emailing? Mints a fresh one and revokes this one."
                                >
                                  🔁 Get link
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => revokePendingInvite(f.id, i.id)}
                                  className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                >
                                  Revoke
                                </button>
                                {/* Resend swaps the row for a new id (see
                                    resendPendingInvite) - checked against the
                                    CURRENT row, not the one that was clicked. */}
                                {i.id === justSentId && <span className="text-green-600">✓ Sent</span>}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {families.length === 0 && <li className="text-sm text-slate-500">No families yet.</li>}
      </ul>

      {/* Who did what: every owner-level action (deactivate, delete, move,
          create, rename, ghost) - none of it has a UI undo, so this is the
          only record of it. */}
      <div className="card-nested rounded-lg p-3">
        <button onClick={() => setAuditOpen((o) => !o)} className="text-sm font-semibold hover:underline">
          {auditOpen ? '▾' : '▸'} Activity log
        </button>
        {auditOpen && (
          <>
            <ul className="mt-2 space-y-1.5 text-xs">
              {auditPage.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-1 border-b pb-1.5 last:border-0 last:pb-0">
                  <span className="font-medium">{a.actorName}</span>
                  <span className="text-slate-500">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>
                  {a.targetLabel && <span className="font-medium">{a.targetLabel}</span>}
                  {a.detail && <span className="text-slate-500">({a.detail})</span>}
                  <span className="ml-auto shrink-0 text-slate-400">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
              {!auditPage.loading && auditPage.items.length === 0 && <li className="text-slate-500">Nothing logged yet.</li>}
            </ul>
            <LoadMoreButton hasMore={auditPage.hasMore} loading={auditPage.loadingMore} onClick={auditPage.loadMore} />
          </>
        )}
      </div>
    </div>
  );
}
