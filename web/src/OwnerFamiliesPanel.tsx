import { useCallback, useEffect, useState } from 'react';
import { api, ROLE_ICON, ROLE_LABEL, type FamilyInfo, type Member } from './api';
import { useDialog } from './Dialog';

// Instance-owner-only: create families, see who's in each, move a member
// between families (with a role for their new home), invite someone
// straight into a specific family, and ghost as anyone — to switch into
// another family's view or to see the app as a kid/adult would.
export default function OwnerFamiliesPanel() {
  const { confirm } = useDialog();
  const [families, setFamilies] = useState<FamilyInfo[]>([]);
  const [membersByFamily, setMembersByFamily] = useState<Record<string, Member[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [moveTarget, setMoveTarget] = useState<Record<string, { userId: string; role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' }>>({});
  const [inviteRole, setInviteRole] = useState<Record<string, 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'>>({});
  const [freshInviteUrl, setFreshInviteUrl] = useState<string | null>(null);

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

  async function toggleExpand(familyId: string) {
    if (expanded === familyId) {
      setExpanded(null);
      return;
    }
    setExpanded(familyId);
    if (!membersByFamily[familyId]) await loadMembers(familyId);
  }

  // Every member across every family, for the "move someone here" picker —
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
      // The member's old family's member list is now stale too — drop both.
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
      const minted = await api.createInvite(role, undefined, familyId);
      setFreshInviteUrl(`${window.location.origin}/?invite=${minted.token}`);
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

      {freshInviteUrl && (
        <div className="rounded bg-amber-50 p-2 text-xs">
          <p className="mb-1 font-medium text-amber-700">Send this link to join that family. One-time use:</p>
          <code className="block break-all rounded bg-white p-2">{freshInviteUrl}</code>
        </div>
      )}

      <ul className="space-y-2">
        {families.map((f) => {
          const members = membersByFamily[f.id];
          const isOpen = expanded === f.id;
          const movable = allMembers.filter((m) => m.familyId !== f.id && m.role !== 'OWNER');
          return (
            <li key={f.id} className="card-nested rounded-lg">
              <div className="flex w-full items-center justify-between px-3 py-2 text-sm">
                <button onClick={() => toggleExpand(f.id)} className="flex-1 text-left font-medium hover:underline">
                  {f.name}
                </button>
                {f.memberCount === 0 && (
                  <button
                    disabled={busy}
                    onClick={() => deleteFamily(f)}
                    className="mr-2 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
                <button onClick={() => toggleExpand(f.id)} className="text-xs text-slate-400 hover:text-slate-600">
                  {f.memberCount} member{f.memberCount === 1 ? '' : 's'} {isOpen ? '▴' : '▾'}
                </button>
              </div>
              {isOpen && (
                <div className="space-y-3 border-t p-3">
                  <ul className="space-y-1">
                    {members?.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <span>{ROLE_ICON[m.role]}</span>
                        <span className="flex-1">{m.displayName}</span>
                        <span className="text-xs text-slate-400">{ROLE_LABEL[m.role] ?? m.role}</span>
                        <button onClick={() => ghostAs(m)} className="rounded border px-2 py-0.5 text-xs hover:bg-slate-50">
                          👻 Ghost as
                        </button>
                      </li>
                    ))}
                    {members?.length === 0 && <li className="text-xs text-slate-400">No members yet.</li>}
                  </ul>

                  <div className="rounded bg-slate-100 p-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">Move someone here as</span>
                      <select
                        value={moveTarget[f.id]?.userId ?? ''}
                        onChange={(e) =>
                          setMoveTarget((prev) => ({ ...prev, [f.id]: { userId: e.target.value, role: prev[f.id]?.role ?? 'ADULT' } }))
                        }
                        className="rounded border px-2 py-1"
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
                        className="rounded border px-2 py-1"
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
                      <p className="mt-1 text-xs text-slate-400">Expand another family first to see members to move.</p>
                    )}
                  </div>

                  <div className="rounded bg-slate-100 p-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">Invite someone to this family as</span>
                      <select
                        value={inviteRole[f.id] ?? 'KID'}
                        onChange={(e) => setInviteRole((prev) => ({ ...prev, [f.id]: e.target.value as 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' }))}
                        className="rounded border px-2 py-1"
                      >
                        <option value="KID">Kid</option>
                        <option value="ADULT">Adult</option>
                        <option value="FAMILY_MANAGER">Family Manager</option>
                        <option value="OWNER">Owner</option>
                      </select>
                      <button disabled={busy} onClick={() => inviteToFamily(f.id)} className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50">
                        Generate invite link
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {families.length === 0 && <li className="text-sm text-slate-400">No families yet.</li>}
      </ul>
    </div>
  );
}
