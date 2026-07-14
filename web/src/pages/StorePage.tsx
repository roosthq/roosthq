import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, type Me, type StorePrize, type Redemption, type FamilyLocation } from '../api';
import TokenBadge from '../TokenBadge';

// Every prize gets one of these — keeps the type row present on every card
// (instead of Event showing a tag and Item showing nothing) so card heights
// line up.
const TYPE_TAG: Record<StorePrize['type'], { icon: string; label: string; className: string }> = {
  ITEM: { icon: '📦', label: 'Item', className: 'text-slate-500' },
  EVENT: { icon: '🎟', label: 'Event', className: 'text-purple-500' },
};

// Downscale + re-encode client-side so an uploaded photo doesn't blow up the
// request body or the database row — this app stores images as data: URIs,
// no separate file storage.
function resizeImageFile(file: File, maxDim = 480, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function PrizeImage({ src, alt, className }: { src?: string | null; alt: string; className: string }) {
  if (src) return <img src={src} alt={alt} className={`${className} object-cover`} />;
  return (
    <div className={`${className} flex items-center justify-center bg-slate-100 text-slate-300`}>
      <span className="text-4xl">🎁</span>
    </div>
  );
}

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
  }, [isAdult, me.id]);

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
                  <span className="min-w-0 break-words">{r.prize.name}</span>
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

function PrizeDetailModal({
  prize,
  tokenName,
  tokenIcon,
  isAdult,
  balance,
  onClose,
  onRedeem,
  onEdit,
  onDelete,
}: {
  prize: StorePrize;
  tokenName: string;
  tokenIcon: string;
  isAdult: boolean;
  balance: number;
  onClose: () => void;
  onRedeem: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{prize.name}</h3>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <PrizeImage src={prize.image} alt={prize.name} className="mt-3 h-56 w-full rounded" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TokenBadge icon={tokenIcon} amount={prize.tokenCost} label={tokenName} size="lg" />
          <span className={`text-sm ${TYPE_TAG[prize.type].className}`}>
            {TYPE_TAG[prize.type].icon} {TYPE_TAG[prize.type].label}
          </span>
          {prize.location && <span className="text-sm text-slate-400">📍 {prize.location.name}</span>}
        </div>
        {prize.description ? (
          <p className="mt-3 text-sm text-slate-600">{prize.description}</p>
        ) : (
          <p className="mt-3 text-sm italic text-slate-300">No description</p>
        )}
        {isAdult && prize.realPrice != null && (
          <p className="mt-2 text-xs text-slate-400">Real price: ${String(prize.realPrice)}</p>
        )}
        {prize.url && (
          <a href={prize.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-blue-600 hover:underline">
            View product ↗
          </a>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {!isAdult ? (
            <button
              onClick={onRedeem}
              disabled={balance < prize.tokenCost}
              className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {balance < prize.tokenCost ? 'Not enough' : 'Redeem'}
            </button>
          ) : (
            <>
              <button onClick={onDelete} className="rounded border px-4 py-1.5 text-sm text-red-500 hover:bg-red-50">
                Delete
              </button>
              <button onClick={onEdit} className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700">
                Edit
              </button>
            </>
          )}
        </div>
      </div>
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
