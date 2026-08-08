import { useEffect, useState } from 'react';
import { CopyableLink } from './InviteLinkBox';
import { api, type DisplayTokenInfo, type DisplayConfig } from './api';
import { formatDate } from './dateFormat';

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

  function displayName(displayConfigId?: string | null) {
    if (!displayConfigId) return 'Default display';
    return displays.find((d) => d.id === displayConfigId)?.name ?? 'Deleted display';
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-700">
        Display access
      </button>
    );

  return (
    <div className="card-nested mt-2 w-full rounded p-3">
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
        <div className="alert-banner mt-3 p-3 text-xs">
          <p className="mb-2 font-medium">Copy this now — the token is shown only once. Open it on the Pi's browser:</p>
          <CopyableLink url={freshUrl} />
        </div>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 break-words">
              {t.label ?? 'Kiosk'} → <strong className="font-medium">{displayName(t.displayConfigId)}</strong> ·{' '}
              {formatDate(t.createdAt)}
              {t.revokedAt && <span className="ml-2 text-red-500">revoked</span>}
            </span>
            {!t.revokedAt && (
              <button onClick={() => revoke(t.id)} className="shrink-0 text-xs text-red-500 hover:text-red-700">
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
