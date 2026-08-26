import { useEffect, useState } from 'react';
import { api, type FamilyInfo, type Member, type Me } from './api';
import ResponsiveDropdown from './ResponsiveDropdown';
import { useDialog } from './Dialog';

// Instance-owner: every family, every member - reaches OwnerFamiliesPanel's
// same ghost() call, just one click away from anywhere instead of a trip to
// Settings -> Instance. Any other adult (family_manager/adult): their OWN
// family's kids only, via the narrower ghostChild() - "hand me your phone"
// so a kid can complete a chore etc. without their own login.
export default function GhostQuickSwitcher({
  me,
  align = 'right',
  triggerClassName,
}: {
  me: Me;
  // Only matters for the desktop popover now (ResponsiveDropdown always
  // renders a full-width bottom sheet below sm, regardless of this) - the
  // desktop mount sits at the far right of the nav bar (right-0 fits), the
  // one inside the mobile hamburger's expanded panel sits mid-row instead.
  align?: 'left' | 'right';
  // Nav.tsx passes its own pill styling so this doesn't sit as bare,
  // boundary-less text next to its neighbors in the header - see Nav.tsx's
  // "can't tell where one button stops and another starts" fix.
  triggerClassName?: string;
}) {
  const isOwner = me.role === 'OWNER';
  const { confirm } = useDialog();
  const [families, setFamilies] = useState<FamilyInfo[]>([]);
  const [membersByFamily, setMembersByFamily] = useState<Record<string, Member[]>>({});
  const [kids, setKids] = useState<Member[]>([]);

  useEffect(() => {
    if (isOwner) {
      api
        .listFamilies()
        .then(async (fams) => {
          setFamilies(fams);
          const lists = await Promise.all(fams.map((f) => api.ownerFamilyMembers(f.id).catch(() => [])));
          setMembersByFamily(Object.fromEntries(fams.map((f, i) => [f.id, lists[i]])));
        })
        .catch(() => setFamilies([]));
    } else {
      api.listUsers().then((ms) => setKids(ms.filter((m) => m.role === 'KID'))).catch(() => setKids([]));
    }
  }, [isOwner]);

  async function ghostAs(m: Member) {
    const ok = await confirm(`Ghost as ${m.displayName}? You'll see the app exactly as they do until you return.`, {
      confirmLabel: 'Ghost',
    });
    if (!ok) return;
    await (isOwner ? api.ghost(m.id) : api.ghostChild(m.id));
    window.location.href = '/';
  }

  return (
    <ResponsiveDropdown
      trigger="👻 Ghost"
      title="Ghost as"
      align={align}
      panelClassName="max-h-96 w-64 overflow-y-auto"
      triggerClassName={triggerClassName}
    >
      <>
        {isOwner ? (
          <>
            {families.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No other families yet.</p>}
            {families.map((f) => (
              <div key={f.id} className="mb-1">
                <div className="px-2 py-1 text-xs font-semibold text-slate-400">{f.name}</div>
                {(membersByFamily[f.id] ?? []).map((m) => (
                  // Bigger and actually bordered on a phone (this renders
                  // inside a full-width BottomSheet there, with no hover
                  // state to lean on) - shrinks back to a compact
                  // hover-only row for the desktop popover.
                  <button
                    key={m.id}
                    onClick={() => ghostAs(m)}
                    className="flex w-full items-center rounded-lg border px-4 py-3 text-left text-base font-medium hover:bg-slate-50 sm:rounded sm:border-0 sm:px-2 sm:py-1 sm:text-sm sm:font-normal sm:text-slate-600 sm:hover:bg-slate-100"
                  >
                    {m.displayName}
                    <span className="ml-1 text-xs text-slate-400">{m.role}</span>
                  </button>
                ))}
                {(membersByFamily[f.id] ?? []).length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No members.</p>}
              </div>
            ))}
          </>
        ) : (
          <>
            {kids.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No kids in the family yet.</p>}
            {kids.map((m) => (
              <button
                key={m.id}
                onClick={() => ghostAs(m)}
                className="flex w-full items-center rounded-lg border px-4 py-3 text-left text-base font-medium hover:bg-slate-50 sm:rounded sm:border-0 sm:px-2 sm:py-1 sm:text-sm sm:font-normal sm:text-slate-600 sm:hover:bg-slate-100"
              >
                {m.displayName}
              </button>
            ))}
          </>
        )}
      </>
    </ResponsiveDropdown>
  );
}
