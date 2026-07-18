import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, type AwardCatalogItem, type Member } from '../api';
import { useDialog } from '../Dialog';
import Modal from '../Modal';

// Curated, kid-friendly picks — not exhaustive (anyone can still type any
// emoji into the text field), just a fast default set.
const EMOJI_OPTIONS = [
  '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '⭐', '🌟', '✨', '💫',
  '🔥', '💪', '👏', '🙌', '🤝', '❤️', '🎉', '🎈', '🎁', '👑',
  '🦸', '🦸‍♀️', '🦸‍♂️', '🚀', '🌈', '☀️', '🐾', '📚', '🎨', '⚽',
  '😇', '😎', '🥳', '💯', '✅', '🧹', '🍽️', '🛏️', '🌱', '🎯',
];

// Icons are either a short emoji string or an uploaded image (data: URI) —
// render whichever one it is consistently wherever an award shows up.
export function AwardIcon({ icon, size = 'text-2xl' }: { icon: string | null; size?: string }) {
  if (icon?.startsWith('data:')) return <img src={icon} alt="" className="h-7 w-7 rounded object-cover" />;
  return <span className={size}>{icon || '🏆'}</span>;
}

// Square, fixed-size icons so the catalog and profile grids line up no
// matter what someone uploads — center-crop to square, then downscale.
function resizeSquareIconFile(file: File, dim = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = dim;
        canvas.height = dim;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
                <AwardIcon icon={a.icon} size="text-2xl" />
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
  const { alert } = useDialog();
  const [name, setName] = useState(award?.name ?? '');
  const [icon, setIcon] = useState(award?.icon ?? '');
  const [iconMode, setIconMode] = useState<'emoji' | 'upload'>(award?.icon?.startsWith('data:') ? 'upload' : 'emoji');
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(award?.description ?? '');

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setIcon(await resizeSquareIconFile(file));
    } catch {
      await alert('Could not read that image.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!name.trim()) return;
    const body = { name: name.trim(), icon: icon.trim(), description: description.trim() || undefined };
    if (award) await api.updateAward(award.id, body);
    else await api.createAward(body);
    onSaved();
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <Modal
      header={<h3 className="text-lg font-semibold">{award ? 'Edit award' : 'Add award'}</h3>}
      footer={
        <div className="flex justify-end gap-2">
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
      }
    >
        <div className="space-y-3">
          <input autoFocus className={input} placeholder="Name, e.g. Good Sport" value={name} onChange={(e) => setName(e.target.value)} />

          <div>
            <span className="text-sm text-slate-500">Icon</span>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={iconMode === 'emoji'} onChange={() => setIconMode('emoji')} />
                Emoji
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={iconMode === 'upload'} onChange={() => setIconMode('upload')} />
                Upload image
              </label>
              <span className="ml-auto flex h-8 w-8 items-center justify-center rounded border">
                <AwardIcon icon={icon} />
              </span>
            </div>

            {iconMode === 'emoji' ? (
              <>
                <div className="mt-2 grid grid-cols-10 gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setIcon(e)}
                      className={`flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-slate-100 ${
                        icon === e ? 'bg-slate-800' : ''
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  className={`${input} mt-2`}
                  placeholder="Or type any emoji"
                  value={icon.startsWith('data:') ? '' : icon}
                  onChange={(e) => setIcon(e.target.value)}
                />
              </>
            ) : (
              <div className="mt-2">
                <input type="file" accept="image/*" onChange={onFile} className="block text-sm" />
                <p className="mt-1 text-xs text-slate-400">
                  Ideal size: 128×128px, square — anything else gets center-cropped to a square automatically.
                </p>
                {uploading && <p className="mt-1 text-xs text-slate-400">Processing image…</p>}
              </div>
            )}
          </div>

          <textarea
            className={input}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
    </Modal>
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
    <Modal
      maxWidthClass="max-w-sm"
      header={
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <AwardIcon icon={award.icon} />
          Give "{award.name}"
        </h3>
      }
      footer={
        <div className="flex justify-end gap-2">
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
      }
    >
      <div className="space-y-3">
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
    </Modal>
  );
}
