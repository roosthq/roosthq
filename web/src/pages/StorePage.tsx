import { useCallback, useEffect, useState } from 'react';
import { api, type Me, type StorePrize, type Redemption } from '../api';

export default function StorePage({ me, tokenName }: { me: Me; tokenName: string }) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [showCreate, setShowCreate] = useState(false);

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
      await refresh();
    } catch {
      alert('Could not redeem — not enough ' + tokenName + '?');
    }
  }

  const pending = history.filter((r) => r.status === 'REQUESTED');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Store</h2>
        {!isAdult && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            {balance} {tokenName}
          </span>
        )}
        {isAdult && (
          <button onClick={() => setShowCreate(true)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            + Add prize
          </button>
        )}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prizes.map((p) => (
          <li key={p.id} className="flex flex-col rounded border p-3">
            {p.image && <img src={p.image} alt={p.name} className="mb-2 h-32 w-full rounded object-cover" />}
            <div className="flex items-start justify-between">
              <span className="font-medium">{p.name}</span>
              <span className="text-sm font-semibold text-amber-600">
                {p.tokenCost} {tokenName}
              </span>
            </div>
            {p.type === 'EVENT' && <span className="text-xs text-purple-500">🎟 Event</span>}
            {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
            {isAdult && p.realPrice != null && (
              <p className="mt-1 text-xs text-slate-400">real price: ${String(p.realPrice)}</p>
            )}
            <div className="mt-auto pt-2">
              {!isAdult ? (
                <button
                  onClick={() => redeem(p)}
                  disabled={balance < p.tokenCost}
                  className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  {balance < p.tokenCost ? 'Not enough' : 'Redeem'}
                </button>
              ) : (
                <button
                  onClick={async () => {
                    if (window.confirm(`Delete "${p.name}"?`)) {
                      await api.deletePrize(p.id);
                      await refresh();
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
        {prizes.length === 0 && <li className="text-sm text-slate-400">No prizes yet.</li>}
      </ul>

      {isAdult && pending.length > 0 && (
        <section className="mt-8">
          <h3 className="text-md font-semibold">Pending redemptions</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded border p-2">
                <span>
                  {r.prize.name} · {r.prize.tokenCost} {tokenName}
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

      {showCreate && <CreatePrize onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await refresh(); }} />}
    </div>
  );
}

function CreatePrize({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [url, setUrl] = useState('');
  const [realPrice, setRealPrice] = useState('');
  const [tokenCost, setTokenCost] = useState(0);
  const [type, setType] = useState<'ITEM' | 'EVENT'>('ITEM');

  async function submit() {
    if (!name) return;
    await api.createPrize({
      name,
      description: description || undefined,
      image: image || undefined,
      url: url || undefined,
      realPrice: realPrice ? Number(realPrice) : undefined,
      tokenCost: Number(tokenCost),
      type,
      scope: 'GLOBAL',
    });
    onCreated();
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Add prize</h3>
        <div className="mt-3 space-y-3">
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className={input} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className={input} placeholder="Image URL (optional)" value={image} onChange={(e) => setImage(e.target.value)} />
          <input className={input} placeholder="Link URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Real price (hidden from kids)</span>
              <input className={input} type="number" value={realPrice} onChange={(e) => setRealPrice(e.target.value)} />
            </label>
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Token cost</span>
              <input className={input} type="number" value={tokenCost} onChange={(e) => setTokenCost(Number(e.target.value))} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-500">Type</span>
            <select className={input} value={type} onChange={(e) => setType(e.target.value as 'ITEM' | 'EVENT')}>
              <option value="ITEM">Item</option>
              <option value="EVENT">Event (e.g. movie trip)</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Add prize</button>
        </div>
      </div>
    </div>
  );
}
