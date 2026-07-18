import { useCallback, useEffect, useState } from 'react';
import { api, type AwardCatalogItem, type Member } from '../api';
import { useDialog } from '../Dialog';

// Adults-only: create/manage the award catalog and hand awards out. Kids
// never see this page (Nav hides the link) or the catalog — only what
// they've actually been given, on their own profile.
export default function AwardsPage() {
  const { confirm, alert } = useDialog();
  const [awards, setAwards] = useState<AwardCatalogItem[]>([]);
  const [kids, setKids] = useState<Member[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AwardCatalogItem | null>(null);
  const [granting, setGranting] = useState<AwardCatalogItem | null>(null);

  const refresh = useCallback(async () => {
    const [a, members] = await Promise.all([api.awardsCatalog(), api.listUsers()]);
    setAwards(a);
    setKids(members.filter((m) => m.role === 'KID'));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function del(a: AwardCatalogItem) {
    if (!(await confirm(`Delete "${a.name}"? This also removes it from anyone who's earned it.`, { danger: true, confirmLabel: 'Delete' })))
      return;
    await api.deleteAward(a.id);
    await refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Awards</h2>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          + Add award
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">Kids only ever see an award once they've been given it.</p>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((a) => (
          <li key={a.id} className="rounded border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-2xl">{a.icon || '🏆'}</span>
                <span className="min-w-0 break-words font-medium">{a.name}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">given {a.grantCount}×</span>
            </div>
            {a.description && <p className="mt-1 text-sm text-slate-500">{a.description}</p>}
            <div className="mt-3 flex gap-2 text-xs">
              <button
                onClick={() => setGranting(a)}
                className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-700"
              >
                Give it
              </button>
              <button
                onClick={() => {
                  setEditing(a);
                  setFormOpen(true);
                }}
                className="rounded border px-3 py-1 hover:bg-slate-50"
              >
                Edit
              </button>
              <button onClick={() => del(a)} className="rounded border px-3 py-1 text-red-500 hover:bg-red-50">
                Delete
              </button>
            </div>
          </li>
        ))}
        {awards.length === 0 && <li className="text-sm text-slate-400">No awards yet.</li>}
      </ul>

      {formOpen && (
        <AwardForm
          award={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}

      {granting && (
        <GrantModal
          award={granting}
          kids={kids}
          onClose={() => setGranting(null)}
          onGranted={async (kidName) => {
            setGranting(null);
            await refresh();
            await alert(`Gave "${granting.name}" to ${kidName}.`);
          }}
        />
      )}
    </div>
  );
}

function AwardForm({
  award,
  onClose,
  onSaved,
}: {
  award: AwardCatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(award?.name ?? '');
  const [icon, setIcon] = useState(award?.icon ?? '');
  const [description, setDescription] = useState(award?.description ?? '');

  async function submit() {
    if (!name.trim()) return;
    const body = { name: name.trim(), icon: icon.trim() || undefined, description: description.trim() || undefined };
    if (award) await api.updateAward(award.id, body);
    else await api.createAward(body);
    onSaved();
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <h3 className="text-lg font-semibold">{award ? 'Edit award' : 'Add award'}</h3>
        <div className="mt-3 space-y-3">
          <input autoFocus className={input} placeholder="Name, e.g. Good Sport" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} placeholder="Emoji (optional), e.g. 🏆" value={icon} onChange={(e) => setIcon(e.target.value)} />
          <textarea
            className={input}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {award ? 'Save changes' : 'Add award'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GrantModal({
  award,
  kids,
  onClose,
  onGranted,
}: {
  award: AwardCatalogItem;
  kids: Member[];
  onClose: () => void;
  onGranted: (kidName: string) => void;
}) {
  const [userId, setUserId] = useState(kids[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId) return;
    setSaving(true);
    try {
      await api.grantAward(award.id, { userId, note: note.trim() || undefined });
      onGranted(kids.find((k) => k.id === userId)?.displayName ?? 'them');
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5">
        <h3 className="text-lg font-semibold">
          Give "{award.name}" {award.icon}
        </h3>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-500">To</span>
            <select className={`${input} mt-1`} value={userId} onChange={(e) => setUserId(e.target.value)}>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.displayName}
                </option>
              ))}
            </select>
            {kids.length === 0 && <p className="mt-1 text-xs text-red-500">No kids in the family yet.</p>}
          </label>
          <input className={input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !userId}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Giving…' : 'Give it'}
          </button>
        </div>
      </div>
    </div>
  );
}
