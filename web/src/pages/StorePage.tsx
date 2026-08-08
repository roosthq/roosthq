import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, type CropRect, type Me, type StorePrize, type Redemption, type FamilyLocation, type Member, kidPermissionEnabled } from '../api';
import TokenBadge from '../TokenBadge';
import { TYPE_TAG, PrizeImage, PrizeDetailModal, resizeImageFile } from '../Prize';
import ImageCropper from '../ImageCropper';
import { useDialog } from '../Dialog';
import Modal from '../Modal';
import { formatDate } from '../dateFormat';

// Store cards are all the same horizontal-rectangle shape (see the grid
// above) — the crop tool matches it, so what you select is exactly what the
// card will show.
const PRIZE_CROP_ASPECT = 16 / 9;

export default function StorePage({
  me,
  tokenName,
  tokenIcon,
  tokenValueUsd,
}: {
  me: Me;
  tokenName: string;
  tokenIcon: string;
  tokenValueUsd: number;
}) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const { alert, confirm } = useDialog();
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [prizeHistory, setPrizeHistory] = useState<Redemption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StorePrize | null>(null);
  const [viewing, setViewing] = useState<StorePrize | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const refresh = useCallback(async () => {
    const [p, b, r] = await Promise.all([
      api.prizes(),
      api.tokenBalance(),
      api.redemptions(isAdult ? {} : { userId: me.id }),
    ]);
    setPrizes(p);
    setBalance(b.balance);
    setHistory(r);
    if (isAdult) api.listUsers().then(setMembers).catch(() => setMembers([]));
  }, [isAdult, me.id]);

  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'Someone';

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Full buyer history for whichever prize is open in the detail modal —
  // adults/owners only (enforced server-side too).
  useEffect(() => {
    if (isAdult && viewing) {
      api.redemptions({ prizeId: viewing.id }).then(setPrizeHistory).catch(() => setPrizeHistory([]));
    } else {
      setPrizeHistory([]);
    }
  }, [isAdult, viewing]);

  // A kid whose store permission is off can browse but not spend; the server
  // enforces it too (assertKidPermission in prizes.service.redeem).
  const canRedeem = kidPermissionEnabled(me, 'store');

  async function redeem(p: StorePrize) {
    if (balance < p.tokenCost) return;
    if (!(await confirm(`Spend ${p.tokenCost} ${tokenName} on "${p.name}"?`, { confirmLabel: 'Redeem' }))) return;
    try {
      await api.redeemPrize(p.id);
      setViewing(null);
      await refresh();
    } catch {
      await alert('Could not redeem — not enough ' + tokenName + '?');
    }
  }

  async function del(p: StorePrize) {
    if (!(await confirm(`Delete "${p.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    await api.deletePrize(p.id);
    setViewing(null);
    await refresh();
  }

  async function rejectSuggestion(p: StorePrize) {
    if (!(await confirm(`Decline "${p.name}"?`, { danger: true, confirmLabel: 'Decline' }))) return;
    await api.deletePrize(p.id);
    await refresh();
  }

  async function toggleArchive(p: StorePrize) {
    await api.updatePrize(p.id, { archived: !p.archived });
    setViewing(null);
    await refresh();
  }

  async function markUsed(redemptionId: string, used: boolean) {
    await api.markRedemptionUsed(redemptionId, used);
    setPrizeHistory((h) => h.map((r) => (r.id === redemptionId ? { ...r, usedAt: used ? new Date().toISOString() : null } : r)));
    await refresh();
  }

  const activePrizes = prizes.filter((p) => !p.archived && !p.suggested);
  const archivedPrizes = prizes.filter((p) => p.archived);
  // Adults: every pending wishlist item, family-wide. Kids: only ever their
  // own (the server hides everyone else's suggestions from them).
  const suggestions = prizes.filter((p) => p.suggested);
  const pending = history.filter((r) => r.status === 'REQUESTED');
  const eventsToFulfill = history.filter((r) => r.status === 'FULFILLED' && r.prize.type === 'EVENT' && !r.usedAt);
  // Claimed events — adults can un-claim one that was ticked off by mistake.
  const eventsDone = history.filter((r) => r.status === 'FULFILLED' && r.prize.type === 'EVENT' && !!r.usedAt);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Store</h2>
        <div className="flex flex-wrap items-center gap-2">
          {!isAdult && <TokenBadge icon={tokenIcon} amount={balance} label={tokenName} size="lg" />}
          {!isAdult && canRedeem && (
            <button onClick={() => setSuggesting(true)} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
              + Request a prize
            </button>
          )}
          {isAdult && (
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              + Add prize
            </button>
          )}
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activePrizes.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setViewing(p)}
              className="flex w-full flex-col overflow-hidden rounded border bg-white text-left hover:shadow-sm"
            >
              {/* Fixed aspect ratio (not a fixed height) so every card lines
                  up the same regardless of whether an image, a crop, or
                  neither is set — a missing image's placeholder box is the
                  exact same size as a photo would be. */}
              <PrizeImage src={p.image} alt={p.name} crop={p.imageCrop} className="aspect-[16/9] w-full" />
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium leading-tight" title={p.name}>{p.name}</span>
                  <TokenBadge icon={tokenIcon} amount={p.tokenCost} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className={TYPE_TAG[p.type].className}>
                    {TYPE_TAG[p.type].icon} {TYPE_TAG[p.type].label}
                  </span>
                  {p.location && <span className="text-slate-400">📍 {p.location.name}</span>}
                </div>
                {p.description ? (
                  <p className="mt-1 truncate text-sm text-slate-500">{p.description}</p>
                ) : (
                  <p className="mt-1 truncate text-sm italic text-slate-300">No description</p>
                )}
                {p.createdByName && <p className="mt-1 text-xs text-slate-400">Added by {p.createdByName}</p>}
              </div>
            </button>
          </li>
        ))}
        {activePrizes.length === 0 && <li className="text-sm text-slate-400">No prizes yet.</li>}
      </ul>

      {isAdult && eventsDone.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">Events done</h3>
          <p className="text-xs text-slate-400">Marked as happened. Put one back if it was a mistake.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {eventsDone.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2">
                <span className="min-w-0 flex-1 break-words">
                  <strong className="font-medium">{memberName(r.userId)} · </strong>
                  {r.prize.name}
                  {r.usedAt && <span className="ml-1 text-xs text-slate-400">{formatDate(r.usedAt)}</span>}
                </span>
                <button
                  onClick={() => markUsed(r.id, false)}
                  className="shrink-0 rounded border px-3 py-1 text-xs hover:bg-slate-50"
                >
                  Mark as not done
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {eventsToFulfill.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">Events to fulfill</h3>
          <p className="text-xs text-slate-400">Approved but the actual event hasn't happened yet.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {eventsToFulfill.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2">
                <span className="min-w-0 flex-1 break-words">
                  {isAdult && <strong className="font-medium">{memberName(r.userId)} · </strong>}
                  {r.prize.name}
                </span>
                {isAdult && (
                  <button
                    onClick={() => markUsed(r.id, true)}
                    className="shrink-0 rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                  >
                    Mark as done
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdult && archivedPrizes.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">Archived</h3>
          <p className="text-xs text-slate-400">Sold, one-off prizes — revive one to put it back in the store.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {archivedPrizes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2">
                <span className="min-w-0 flex-1 break-words text-slate-500">{p.name}</span>
                <button onClick={() => toggleArchive(p)} className="shrink-0 rounded border px-3 py-1 text-xs hover:bg-slate-50">
                  Revive
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">{isAdult ? 'Wishlist suggestions' : 'My requests'}</h3>
          {!isAdult && <p className="text-xs text-slate-400">Waiting for an adult to review these.</p>}
          <ul className="mt-2 space-y-1 text-sm">
            {suggestions.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2">
                <span className="min-w-0 flex-1 break-words">
                  {p.name}
                  {isAdult && p.suggestedByName && (
                    <span className="ml-2 text-xs text-slate-400">from {p.suggestedByName}</span>
                  )}
                  {!isAdult && <span className="ml-2 text-xs text-amber-600">Waiting for approval</span>}
                </span>
                {isAdult && (
                  <span className="flex shrink-0 gap-2">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                      className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                    >
                      Review
                    </button>
                    <button onClick={() => rejectSuggestion(p)} className="rounded border px-3 py-1 text-xs text-red-500 hover:bg-red-50">
                      Decline
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdult && pending.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">Pending redemptions</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded border bg-white p-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 break-words">
                    <strong className="font-medium">{memberName(r.userId)}</strong> wants {r.prize.name}
                  </span>
                  <TokenBadge icon={tokenIcon} amount={r.prize.tokenCost} />
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={async () => {
                      await api.fulfillRedemption(r.id);
                      await refresh();
                    }}
                    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500"
                  >
                    Fulfilled
                  </button>
                  <button
                    onClick={async () => {
                      await api.rejectRedemption(r.id);
                      await refresh();
                    }}
                    className="rounded border px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    Reject &amp; refund
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isAdult && history.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">My purchases</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {history.map((r) => (
              <li key={r.id} className="flex justify-between border-b py-1">
                <span>{r.prize.name}</span>
                <span className="text-slate-400">
                  {formatDate(r.requestedAt)} · {r.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {viewing && (
        <PrizeDetailModal
          prize={viewing}
          tokenName={tokenName}
          tokenIcon={tokenIcon}
          isAdult={isAdult}
          balance={balance}
          history={prizeHistory}
          memberName={memberName}
          onClose={() => setViewing(null)}
          canRedeem={canRedeem}
          onRedeem={() => redeem(viewing)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
            setFormOpen(true);
          }}
          onDelete={() => del(viewing)}
          onToggleArchive={() => toggleArchive(viewing)}
          onMarkUsed={markUsed}
        />
      )}

      {formOpen && (
        <PrizeForm
          prize={editing}
          members={members}
          tokenValueUsd={tokenValueUsd}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}

      {suggesting && (
        <SuggestPrizeModal
          onClose={() => setSuggesting(false)}
          onSaved={async () => {
            setSuggesting(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function SuggestPrizeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.suggestPrize({ name: name.trim(), description: description.trim() || undefined, url: url.trim() || undefined });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <Modal
      header={
        <>
          <h3 className="text-lg font-semibold">Request a prize</h3>
          <p className="mt-1 text-xs text-slate-400">An adult will review this and set the token cost.</p>
        </>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Sending…' : 'Send request'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <input autoFocus className={input} placeholder="What do you want?" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          className={input}
          placeholder="Why / details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input className={input} placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
    </Modal>
  );
}

export function PrizeForm({
  prize,
  members,
  tokenValueUsd,
  onClose,
  onSaved,
  kioskToken,
}: {
  prize: StorePrize | null;
  members: Member[];
  tokenValueUsd: number;
  onClose: () => void;
  onSaved: () => void;
  kioskToken?: string;
}) {
  const { alert } = useDialog();
  const [name, setName] = useState(prize?.name ?? '');
  const [description, setDescription] = useState(prize?.description ?? '');
  const [image, setImage] = useState(prize?.image ?? '');
  const [imageCrop, setImageCrop] = useState<CropRect | null>(prize?.imageCrop ?? null);
  const [cropping, setCropping] = useState(false);
  const [imageMode, setImageMode] = useState<'url' | 'upload'>(prize?.image?.startsWith('data:') ? 'upload' : 'url');
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState(prize?.url ?? '');
  const [realPrice, setRealPrice] = useState(prize?.realPrice != null ? String(prize.realPrice) : '');
  const [tokenCost, setTokenCost] = useState(prize?.tokenCost ?? 0);
  // Once true, real-price changes stop overwriting tokenCost — the adult took
  // the wheel. Starts true when editing an existing prize (don't clobber it).
  const [tokenCostTouched, setTokenCostTouched] = useState(!!prize);
  const [type, setType] = useState<'ITEM' | 'EVENT'>(prize?.type ?? 'ITEM');
  const [repeatable, setRepeatable] = useState(prize?.repeatable ?? true);
  const [scope, setScope] = useState<'GLOBAL' | 'SPECIFIC'>(prize?.scope ?? 'GLOBAL');
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set(prize?.assignedUserIds ?? []));
  const [locationId, setLocationId] = useState(prize?.location?.id ?? '');
  const [locations, setLocations] = useState<FamilyLocation[]>([]);

  useEffect(() => {
    api.locations(kioskToken).then(setLocations).catch(() => undefined);
  }, [kioskToken]);

  function onRealPriceChange(v: string) {
    setRealPrice(v);
    if (tokenCostTouched) return;
    const n = Number(v);
    if (v && !Number.isNaN(n) && n >= 0) setTokenCost(Math.floor(n / tokenValueUsd));
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setImage(await resizeImageFile(file));
      setImageCrop(null); // a genuinely new image — the old crop rect doesn't apply to it
    } catch {
      await alert('Could not read that image.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!name) return;
    const body = {
      name,
      description: description || undefined,
      image: image || undefined,
      imageCrop: image ? imageCrop : null,
      url: url || undefined,
      realPrice: realPrice ? Number(realPrice) : undefined,
      tokenCost: Math.max(0, Math.floor(Number(tokenCost) || 0)),
      type,
      repeatable,
      scope,
      assignedUserIds: scope === 'SPECIFIC' ? [...assignedUserIds] : [],
      locationId: locationId || null,
      ...(prize?.suggested ? { suggested: false } : {}),
    };
    if (prize) await api.updatePrize(prize.id, body, kioskToken);
    else await api.createPrize(body, kioskToken);
    onSaved();
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <>
    <Modal
      header={
        <>
          <h3 className="text-lg font-semibold">{prize ? (prize.suggested ? 'Review request' : 'Edit prize') : 'Add prize'}</h3>
          {prize?.suggested && (
            <p className="mt-1 text-xs text-amber-600">
              Requested by {prize.suggestedByName ?? 'a kid'} — fill in the token cost and anything else, then approve.
            </p>
          )}
        </>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            {prize ? (prize.suggested ? 'Approve & add to store' : 'Save changes') : 'Add prize'}
          </button>
        </div>
      }
    >
        <div className="space-y-3">
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className={input}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div>
            <span className="text-sm text-slate-500">Image</span>
            <div className="mt-1 flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={imageMode === 'url'} onChange={() => setImageMode('url')} />
                URL
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={imageMode === 'upload'} onChange={() => setImageMode('upload')} />
                Upload
              </label>
            </div>
            {imageMode === 'url' ? (
              <input
                className={`${input} mt-1`}
                placeholder="Image URL (optional)"
                value={image.startsWith('data:') ? '' : image}
                onChange={(e) => setImage(e.target.value)}
              />
            ) : (
              <input type="file" accept="image/*" onChange={onFile} className="mt-1 block text-sm" />
            )}
            {uploading && <p className="mt-1 text-xs text-slate-400">Processing image…</p>}
            {image && (
              <div className="mt-2 flex items-center gap-3">
                <PrizeImage src={image} alt="" crop={imageCrop} className="h-20 w-36 rounded" />
                <div>
                  <button type="button" onClick={() => setCropping(true)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    {imageCrop ? 'Adjust crop' : 'Crop for the store card'}
                  </button>
                  <p className="mt-1 text-xs text-slate-400">
                    Only affects the small card — the full image still shows when someone opens the prize
                    {imageMode === 'url' ? ' or the link' : ''}. Nothing about the {imageMode === 'url' ? 'URL' : 'photo'} itself changes.
                  </p>
                </div>
              </div>
            )}
            {!image && <p className="mt-1 text-xs text-slate-400">No image yet — a default icon will show instead.</p>}
          </div>

          <input className={input} placeholder="Link URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Real price (hidden from kids)</span>
              <input className={input} type="number" min={0} value={realPrice} onChange={(e) => onRealPriceChange(e.target.value)} onFocus={(e) => e.target.select()} />
            </label>
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Token cost</span>
              <input
                className={input}
                type="number"
                min={0}
                value={tokenCost}
                onChange={(e) => {
                  setTokenCostTouched(true);
                  setTokenCost(Math.floor(Number(e.target.value) || 0));
                }}
                onFocus={(e) => e.target.select()}
              />
            </label>
          </div>
          {realPrice !== '' && !tokenCostTouched && (
            <p className="text-xs text-slate-400">Auto-set from real price (always rounded down) — edit to override.</p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)} />
            Can be purchased again after being bought
          </label>
          <p className="text-xs text-slate-400">
            {repeatable
              ? 'Stays in the store — anyone eligible can buy it any number of times.'
              : "Sold once, then archived — you'll need to revive it from the archive to sell it again."}
          </p>

          <div>
            <span className="text-sm text-slate-500">Who can redeem?</span>
            <div className="mt-1 flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={scope === 'GLOBAL'} onChange={() => setScope('GLOBAL')} />
                Open to anyone
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={scope === 'SPECIFIC'} onChange={() => setScope('SPECIFIC')} />
                Specific people
              </label>
            </div>
            {scope === 'SPECIFIC' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={assignedUserIds.has(m.id)}
                      onChange={(e) => {
                        const n = new Set(assignedUserIds);
                        if (e.target.checked) n.add(m.id);
                        else n.delete(m.id);
                        setAssignedUserIds(n);
                      }}
                    />
                    {m.displayName}
                  </label>
                ))}
                {members.length === 0 && <span className="text-xs text-slate-400">No members yet.</span>}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Type</span>
              <select className={input} value={type} onChange={(e) => setType(e.target.value as 'ITEM' | 'EVENT')}>
                <option value="ITEM">Item</option>
                <option value="EVENT">Event (e.g. movie trip)</option>
              </select>
            </label>
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Location (optional)</span>
              <select className={input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">No location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
    </Modal>
    {cropping && image && (
      <ImageCropper
        src={image}
        aspect={PRIZE_CROP_ASPECT}
        initial={imageCrop}
        title="Crop for the store card"
        onCancel={() => setCropping(false)}
        onConfirm={(rect) => {
          setImageCrop(rect);
          setCropping(false);
        }}
      />
    )}
    </>
  );
}
