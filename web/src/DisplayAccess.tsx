import { useEffect, useState } from 'react';
import { api, type DisplayTokenInfo, type DisplayConfig } from './api';

// Owner-only panel to mint / revoke kiosk links, each bound to a display layout.
export default function DisplayAccess() {
  const [tokens, setTokens] = useState<DisplayTokenInfo[]>([]);
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [selected, setSelected] = useState('');
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function refresh() {
    const [t, d] = await Promise.all([api.listDisplayTokens(), api.listDisplays()]);
    setTokens(t);
    setDisplays(d);
    if (!selected && d[0]) setSelected(d[0].id);
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function mint() {
    const minted = await api.mintDisplayToken('Kiosk', selected || undefined);
    setFreshUrl(`${window.location.origin}/?display=1&token=${minted.token}`);
    await refresh();
  }

  async function revoke(id: string) {
    await api.revokeDisplayToken(id);
    await refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded border bg-white px-3 py-1 hover:bg-slate-100">
        Display access
      </button>
    );

  return (
    <div className="mt-2 w-full rounded border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Display access (kiosk links)</span>
        <div className="flex items-center gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded border px-2 py-1 text-xs">
            {displays.length === 0 && <option value="">Default display</option>}
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button onClick={mint} className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700">
            + Generate kiosk link
          </button>
        </div>
      </div>

      {freshUrl && (
        <div className="mt-3 rounded bg-amber-50 p-2 text-xs">
          <p className="mb-1 font-medium text-amber-700">
            Copy this now — the token is shown only once. Open it on the Pi's browser:
          </p>
          <code className="block break-all rounded bg-white p-2">{freshUrl}</code>
        </div>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between">
            <span>
              {t.label ?? 'Kiosk'} · {new Date(t.createdAt).toLocaleDateString()}
              {t.revokedAt && <span className="ml-2 text-red-500">revoked</span>}
            </span>
            {!t.revokedAt && (
              <button onClick={() => revoke(t.id)} className="text-xs text-red-500 hover:text-red-700">
                Revoke
              </button>
            )}
          </li>
        ))}
        {tokens.length === 0 && <li className="text-slate-400">No kiosk links yet.</li>}
      </ul>
    </div>
  );
}
