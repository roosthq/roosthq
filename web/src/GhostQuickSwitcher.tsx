import { useEffect, useState } from 'react';
import { api, type FamilyInfo, type Member } from './api';
import DropdownDetails from './DropdownDetails';
import { useDialog } from './Dialog';

// Instance-owner-only quick switcher, always in reach from the nav bar -
// OwnerFamiliesPanel (Settings -> Instance) already has a ghost button per
// member, but getting there is several clicks away from wherever you
// actually are. Loaded once on mount (a handful of families with a handful
// of members each, at this app's scale - no need to gate the fetch on the
// dropdown actually being opened).
export default function GhostQuickSwitcher() {
  const { confirm } = useDialog();
  const [families, setFamilies] = useState<FamilyInfo[]>([]);
  const [membersByFamily, setMembersByFamily] = useState<Record<string, Member[]>>({});

  useEffect(() => {
    api
      .listFamilies()
      .then(async (fams) => {
        setFamilies(fams);
        const lists = await Promise.all(fams.map((f) => api.ownerFamilyMembers(f.id).catch(() => [])));
        setMembersByFamily(Object.fromEntries(fams.map((f, i) => [f.id, lists[i]])));
      })
      .catch(() => setFamilies([]));
  }, []);

  async function ghostAs(m: Member) {
    const ok = await confirm(`Ghost as ${m.displayName}? You'll see the app exactly as they do until you return.`, {
      confirmLabel: 'Ghost',
    });
    if (!ok) return;
    await api.ghost(m.id);
    window.location.href = '/';
  }

  return (
    <DropdownDetails summary="👻 Ghost">
      <div className="absolute right-0 z-20 mt-1 max-h-96 w-64 overflow-y-auto rounded border bg-white p-2 shadow">
        {families.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No other families yet.</p>}
        {families.map((f) => (
          <div key={f.id} className="mb-1">
            <div className="px-2 py-1 text-xs font-semibold text-slate-400">{f.name}</div>
            {(membersByFamily[f.id] ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => ghostAs(m)}
                className="block w-full rounded px-2 py-1 text-left text-sm text-slate-600 hover:bg-slate-100"
              >
                {m.displayName}
                <span className="ml-1 text-xs text-slate-400">{m.role}</span>
              </button>
            ))}
            {(membersByFamily[f.id] ?? []).length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No members.</p>}
          </div>
        ))}
      </div>
    </DropdownDetails>
  );
}
