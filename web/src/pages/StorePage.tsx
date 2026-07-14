import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, type Me, type StorePrize, type Redemption, type FamilyLocation, type Member } from '../api';
import TokenBadge from '../TokenBadge';
import { TYPE_TAG, PrizeImage, PrizeDetailModal, resizeImageFile } from '../Prize';

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
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StorePrize | null>(null);
  const [viewing, setViewing] = useState<StorePrize | null>(null);

  const refresh = useCallback(async () => {
    const [p, b, r] = await Promise.all([
      api.prizes(),
      api.tokenBalance(),
      api.redemptions(isAdult ? undefined : me.id),
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

  async function redeem(p: StorePrize) {
    if (balance < p.tokenCost) return;
    if (!window.confirm(`Spend ${p.tokenCost} ${tokenName} on "${p.name}"?`)) return;
    try {
      await api.redeemPrize(p.id);
      setViewing(null);
      await refresh();
    } catch {
      alert('Could not redeem — not enough ' + tokenName + '?');
    }
  }

  async function del(p: StorePrize) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    await api.deletePrize(p.id);
    setViewing(null);
    await refresh();
  }

  const pending = history.filter((r) => r.status === 'REQUESTED');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Store</h2>
        {!isAdult && <TokenBadge icon={tokenIcon} amount={balance} label={tokenName} size="lg" />}
        {isAdult && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            + Add prize
          </button>
        )}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prizes.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setViewing(p)}
              className="flex w-full flex-col overflow-hidden rounded border text-left hover:shadow-sm"
            >
              <PrizeImage src={p.image} alt={p.name} className="h-32 w-full" />
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words font-medium leading-tight">{p.name}</span>
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
              </div>
            </button>
          </li>
        ))}
        {prizes.length === 0 && <li className="text-sm text-slate-400">No prizes yet.</li>}
      </ul>

      {isAdult && pending.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">Pending redemptions</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded border p-2">
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
                  {new Date(r.requestedAt).toLocaleDateString()} · {r.status.toLowerCase()}
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
          onClose={() => setViewing(null)}
          onRedeem={() => redeem(viewing)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
            setFormOpen(true);
          }}
          onDelete={() => del(viewing)}
        />
      )}

      {formOpen && (
        <PrizeForm
          prize={editing}
          tokenValueUsd={tokenValueUsd}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function PrizeForm({
  prize,
  tokenValueUsd,
  onClose,
  onSaved,
}: {
  prize: StorePrize | null;
  tokenValueUsd: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(prize?.name ?? '');
  const [description, setDescription] = useState(prize?.description ?? '');
  const [image, setImage] = useState(prize?.image ?? '');
  const [imageMode, setImageMode] = useState<'url' | 'upload'>(prize?.image?.startsWith('data:') ? 'upload' : 'url');
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState(prize?.url ?? '');
  const [realPrice, setRealPrice] = useState(prize?.realPrice != null ? String(prize.realPrice) : '');
  const [tokenCost, setTokenCost] = useState(prize?.tokenCost ?? 0);
  // Once true, real-price changes stop overwriting tokenCost — the adult took
  // the wheel. Starts true when editing an existing prize (don't clobber it).
  const [tokenCostTouched, setTokenCostTouched] = useState(!!prize);
  const [type, setType] = useState<'ITEM' | 'EVENT'>(prize?.type ?? 'ITEM');
  const [locationId, setLocationId] = useState(prize?.location?.id ?? '');
  const [locations, setLocations] = useState<FamilyLocation[]>([]);

  useEffect(() => {
    api.locations().then(setLocations).catch(() => undefined);
  }, []);

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
    } catch {
      alert('Could not read that image.');
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
      url: url || undefined,
      realPrice: realPrice ? Number(realPrice) : undefined,
      tokenCost: Math.max(0, Math.floor(Number(tokenCost) || 0)),
      type,
      scope: 'GLOBAL' as const,
      locationId: locationId || null,
    };
    if (prize) await api.updatePrize(prize.id, body);
    else await api.createPrize(body);
    onSaved();
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-auto rounded-lg bg-white p-5">
        <h3 className="text-lg font-semibold">{prize ? 'Edit prize' : 'Add prize'}</h3>
        <div className="mt-3 space-y-3">
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
            {image && <img src={image} alt="" className="mt-2 h-20 w-20 rounded object-cover" />}
            {!image && <p className="mt-1 text-xs text-slate-400">No image yet — a default icon will show instead.</p>}
          </div>

          <input className={input} placeholder="Link URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Real price (hidden from kids)</span>
              <input className={input} type="number" min={0} value={realPrice} onChange={(e) => onRealPriceChange(e.target.value)} />
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
              />
            </label>
          </div>
          {realPrice !== '' && !tokenCostTouched && (
            <p className="text-xs text-slate-400">Auto-set from real price (always rounded down) — edit to override.</p>
          )}
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
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            {prize ? 'Save changes' : 'Add prize'}
          </button>
        </div>
      </div>
    </div>
  );
}
