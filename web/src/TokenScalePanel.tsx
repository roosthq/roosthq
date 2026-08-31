import { useEffect, useState } from 'react';
import { api, type FamilySettings, type TokenScaleEvent, type TokenScalePreview } from './api';
import Modal from './Modal';

// PLANNING.md §17 - the only place Family.tokenValueUsd can change. Not a
// plain settings field: changing it also rescales every token-denominated
// number in the family (chore rewards, prize costs, balances, allowances,
// the streak-bonus wheel) to match, via TokenScaleService on the server.
// Level/XP never moves - that's handled entirely server-side (an invariant
// lifetime total LevelBadge divides back out for display only), nothing
// this panel needs to think about.
export default function TokenScalePanel({ family, onChanged }: { family: FamilySettings; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<TokenScaleEvent[] | null>(null);
  const [input, setInput] = useState(String(family.tokenValueUsd));
  const [preview, setPreview] = useState<TokenScalePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openModal() {
    setInput(String(family.tokenValueUsd));
    setPreview(null);
    setError(null);
    setOpen(true);
  }

  async function loadPreview() {
    const value = Number(input);
    if (!(value > 0)) {
      setError('Enter a positive number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.previewTokenScale(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not preview that change');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await api.commitTokenScale(preview.newTokenValueUsd);
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that change');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (historyOpen && history === null) {
      api.tokenScaleHistory().then(setHistory).catch(() => setHistory([]));
    }
  }, [historyOpen, history]);

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-slate-500">1 unit = how many dollars?</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="w-24 rounded border bg-slate-50 px-3 py-1.5 text-sm text-slate-500">${family.tokenValueUsd}</span>
          <button onClick={openModal} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            Change scale…
          </button>
        </div>
      </label>
      <p className="text-xs text-slate-400">
        Changing this rescales every {family.tokenName.toLowerCase()}-denominated number in the family to match - balances, chore
        rewards, prize costs, allowances. Nobody's level changes.
      </p>
      <button onClick={() => setHistoryOpen((v) => !v)} className="text-xs text-slate-400 underline hover:text-slate-600">
        {historyOpen ? 'Hide' : 'Show'} scale history
      </button>
      {historyOpen && (
        <ul className="space-y-1">
          {(history ?? []).map((h) => (
            <li key={h.id} className="text-xs text-slate-400">
              {new Date(h.createdAt).toLocaleDateString()} - {h.actorName} changed ${h.oldTokenValueUsd} → ${h.newTokenValueUsd} per token
            </li>
          ))}
          {history !== null && history.length === 0 && <li className="text-xs text-slate-400">No changes yet.</li>}
        </ul>
      )}

      {open && (
        <Modal
          header={<h3 className="text-lg font-semibold">Change token scale</h3>}
          onBackdropClick={() => !busy && setOpen(false)}
          maxWidthClass="max-w-lg"
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded border px-3 py-1.5 text-sm">
                Cancel
              </button>
              {preview ? (
                <button
                  onClick={confirm}
                  disabled={busy}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Confirm rescale
                </button>
              ) : (
                <button
                  onClick={loadPreview}
                  disabled={busy}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Preview
                </button>
              )}
            </div>
          }
        >
          {!preview ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-slate-500">New $ value per token (currently ${family.tokenValueUsd})</span>
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="mt-1 w-32 rounded border px-3 py-1.5 text-sm"
                  autoFocus
                />
              </label>
              <p className="text-xs text-slate-400">
                e.g. 0.01 makes it "100 tokens = $1"; 100 makes it "1 token = $100" - either direction, any value.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                ${preview.oldTokenValueUsd} → <strong>${preview.newTokenValueUsd}</strong> per token ({preview.factor.toFixed(3)}x)
              </p>
              {!preview.cleanRatio && (
                <p className="alert-banner rounded p-2 text-xs">
                  That ratio doesn't divide evenly - balances may round a token or two differently between people afterward. Not a
                  problem, just letting you know before you confirm.
                </p>
              )}
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Balances</p>
                <ul className="space-y-1">
                  {preview.members.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between text-sm">
                      <span>{m.displayName}</span>
                      <span className={m.crushWarning ? 'font-medium text-red-600' : 'text-slate-600'}>
                        {m.balanceBefore} → {m.balanceAfter}
                        {m.crushWarning && ' ⚠️ rounds to almost nothing'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-slate-400">
                Also rescales: {preview.affected.chores} chore reward{preview.affected.chores === 1 ? '' : 's'},{' '}
                {preview.affected.prizes} prize cost{preview.affected.prizes === 1 ? '' : 's'}, {preview.affected.awards} award
                value{preview.affected.awards === 1 ? '' : 's'}
                {preview.affected.unplayedGames > 0 && `, ${preview.affected.unplayedGames} unplayed bonus game(s)`}. Nobody's level
                changes.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={() => setPreview(null)} className="text-xs text-slate-400 underline hover:text-slate-600">
                ← Change the value
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
