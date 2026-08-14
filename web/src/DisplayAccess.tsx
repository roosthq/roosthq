import { useEffect, useState } from 'react';
import { CopyableLink } from './InviteLinkBox';
import { api, type DisplayTokenInfo, type DisplayConfig } from './api';
import { formatDate } from './dateFormat';

// Owner-only panel to mint / revoke kiosk links, each bound to a display
// layout - lives in Family Settings' own "Kiosk links" tab (nav reorg,
// 2026-08), which is already the disclosure step; no reveal button needed
// on top of that anymore.
export default function DisplayAccess() {
  const [tokens, setTokens] = useState<DisplayTokenInfo[]>([]);
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [selected, setSelected] = useState('');
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  async function refresh() {
    const [t, d] = await Promise.all([api.listDisplayTokens(), api.listDisplays()]);
    setTokens(t);
    setDisplays(d);
    if (!selected && d[0]) setSelected(d[0].id);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function mint() {
    const minted = await api.mintDisplayToken('Kiosk', selected || undefined);
    setFreshUrl(`${window.location.origin}/?display=1&token=${minted.token}`);
    await refresh();
  }

  async function revoke(id: string) {
    await api.revokeDisplayToken(id);
    await refresh();
  }

  async function deleteToken(id: string) {
    await api.deleteDisplayToken(id);
    await refresh();
  }

  async function clearRevoked() {
    await api.deleteAllRevokedDisplayTokens();
    await refresh();
  }

  const revokedCount = tokens.filter((t) => t.revokedAt).length;

  // Only the hash is ever stored server-side, so a link closed/lost before
  // the Pi's browser got pointed at it can't be shown again - this mints a
  // fresh one on the same display (old one revoked) and reuses the same
  // reveal-it banner mint() does.
  async function regenerate(id: string) {
    const minted = await api.regenerateDisplayToken(id);
    setFreshUrl(`${window.location.origin}/?display=1&token=${minted.token}`);
    await refresh();
  }

  function displayName(displayConfigId?: string | null) {
    if (!displayConfigId) return 'Default display';
    return displays.find((d) => d.id === displayConfigId)?.name ?? 'Deleted display';
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {revokedCount > 0 && (
          <button onClick={clearRevoked} className="rounded border px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50" title="Permanently delete every revoked link below">
            🗑 Clear {revokedCount} revoked
          </button>
        )}
      </div>

      {freshUrl && (
        <div className="alert-banner mt-3 p-3 text-xs">
          <p className="mb-2 font-medium">Copy this now - the token is shown only once. Open it on the Pi's browser:</p>
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
              <>
                <button
                  onClick={() => api.reloadDisplay(t.displayConfigId ?? undefined)}
                  className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-slate-50"
                  title="Reload this kiosk if it's stuck (does nothing if its link was actually revoked)"
                >
                  🔄
                </button>
                <button
                  onClick={() => regenerate(t.id)}
                  className="shrink-0 text-xs text-slate-500 hover:text-slate-800"
                  title="Lost the link, or need to re-copy it? Mints a fresh one for this display and revokes this one."
                >
                  🔁 Get link
                </button>
                <button onClick={() => revoke(t.id)} className="shrink-0 text-xs text-red-500 hover:text-red-700">
                  Revoke
                </button>
              </>
            )}
            {t.revokedAt && (
              <button onClick={() => deleteToken(t.id)} className="shrink-0 text-xs text-slate-400 hover:text-red-600" title="Permanently delete this revoked link">
                🗑 Delete
              </button>
            )}
          </li>
        ))}
        {tokens.length === 0 && <li className="text-slate-400">No kiosk links yet.</li>}
      </ul>
    </div>
  );
}
