import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, type AwardCatalogItem, type AwardGrantHistoryItem, type Member, type PoolEntry, type GameType, type StorePrize } from '../api';
import { useDialog } from '../Dialog';
import Modal from '../Modal';
import TokenBadge from '../TokenBadge';
import IconPicker from '../IconPicker';
import { formatDateTime } from '../dateFormat';
import { AWARD_PACKS } from '../awardPacks';
import { GAME_TYPES, GAME_TYPE_META, fakePreviewRoll } from '../rewardGames';
import RewardRevealModal from '../RewardRevealModal';
import { PrizeImage } from '../Prize';

// Icons are either a short emoji string or an uploaded image (data: URI) -
// render whichever one it is consistently wherever an award shows up.
export function AwardIcon({ icon, size = 'text-2xl' }: { icon: string | null; size?: string }) {
  if (icon?.startsWith('data:')) return <img src={icon} alt="" className="h-7 w-7 rounded object-cover" />;
  return <span className={size}>{icon || '🏆'}</span>;
}

// Square, fixed-size icons so the catalog and profile grids line up no
// matter what someone uploads - center-crop to square, then downscale.
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
// never see this page (Nav hides the link) or the catalog - only what
// they've actually been given, on their own profile.
export default function AwardsPage({ tokenName, tokenIcon }: { tokenName: string; tokenIcon: string }) {
  const { confirm, alert } = useDialog();
  const [awards, setAwards] = useState<AwardCatalogItem[]>([]);
  const [kids, setKids] = useState<Member[]>([]);
  const [history, setHistory] = useState<AwardGrantHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [editing, setEditing] = useState<AwardCatalogItem | null>(null);
  const [granting, setGranting] = useState<AwardCatalogItem | null>(null);
  const [removing, setRemoving] = useState<{
    grant: AwardGrantHistoryItem;
    impact: { award: number; wheel: number; total: number };
    removeTokens: boolean;
  } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [a, members, h] = await Promise.all([api.awardsCatalog(), api.listUsers(), api.awardHistory()]);
    setAwards(a);
    setKids(members.filter((m) => m.role === 'KID'));
    setHistory(h);
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

  // Removing a grant is two separate decisions: take the badge back (always),
  // and take the tokens back (a choice - they may have earned those fairly and
  // only the badge was a mistake). So this needs a real dialog with a checkbox
  // rather than the generic confirm(), and the numbers come from the server
  // since a spun bonus wheel's amount isn't in the history row.
  async function askRemoveGrant(g: AwardGrantHistoryItem) {
    const impact = await api.awardGrantImpact(g.id).catch(() => ({ award: g.tokenValue, wheel: 0, total: g.tokenValue }));
    setRemoving({ grant: g, impact, removeTokens: impact.total > 0 });
  }

  async function confirmRemoveGrant() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await api.removeAwardGrant(removing.grant.id, removing.removeTokens);
      setRemoving(null);
      await refresh();
    } catch (e) {
      await alert(e instanceof Error ? e.message : 'Could not remove that award.');
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Awards</h2>
        <span className="flex gap-2">
          <button onClick={() => setPacksOpen(true)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50" title="Add a ready-made set of award badges">
            📦 Packs
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            + Add award
          </button>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">Kids only ever see an award once they've been given it.</p>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((a) => (
          <li key={a.id} className="rounded border bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <AwardIcon icon={a.icon} size="text-2xl" />
                <span className="min-w-0 break-words font-medium">{a.name}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">given {a.grantCount}×</span>
            </div>
            {a.description && <p className="mt-1 text-sm text-slate-500">{a.description}</p>}
            {(a.defaultTokenValue > 0 || (a.wheelMax ?? 0) > 0 || (a.pool?.length ?? 0) > 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {a.defaultTokenValue > 0 && <TokenBadge icon={tokenIcon} amount={a.defaultTokenValue} />}
                {(a.wheelMax ?? 0) > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}
                    title={`Giving this also queues a bonus wheel worth ${a.wheelMin ?? 1}-${a.wheelMax} ${tokenName} for them to spin`}
                  >
                    🎡 wheel {a.wheelMin ?? 1}-{a.wheelMax}
                  </span>
                )}
                {(a.pool?.length ?? 0) > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}
                    title={`Giving this also queues a reward game from a ${a.pool!.length}-entry pool`}
                  >
                    🎮 reward game
                  </span>
                )}
              </div>
            )}
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
              <button onClick={() => del(a)} className="btn-delete rounded px-3 py-1">
                Delete
              </button>
            </div>
          </li>
        ))}
        {awards.length === 0 && <li className="text-sm text-slate-400">No awards yet.</li>}
      </ul>

      <section className="mt-8">
        <button onClick={() => setHistoryOpen((v) => !v)} className="text-sm font-semibold hover:underline">
          {historyOpen ? '▾' : '▸'} History ({history.length})
        </button>
        {historyOpen && (
          <ul className="mt-3 space-y-2">
            {history.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white p-3 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <AwardIcon icon={g.award.icon} size="text-xl" />
                  <span className="min-w-0">
                    <span className="font-medium">{g.award.name}</span> → <span className="font-medium">{g.user.displayName}</span>
                    {g.note && <span className="ml-1 text-slate-400">"{g.note}"</span>}
                    <div className="text-xs text-slate-400">
                      by {g.grantedBy.displayName} · {formatDateTime(g.createdAt)}
                    </div>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {g.tokenValue > 0 && <TokenBadge icon={tokenIcon} amount={g.tokenValue} />}
                  <button onClick={() => askRemoveGrant(g)} className="text-xs text-red-500 hover:text-red-700">
                    Remove
                  </button>
                </span>
              </li>
            ))}
            {history.length === 0 && <li className="text-sm text-slate-400">No awards given yet.</li>}
          </ul>
        )}
      </section>

      {removing && (
        <Modal
          header={<h3 className="text-base font-semibold">Remove award</h3>}
          onBackdropClick={() => setRemoving(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setRemoving(null)} className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={confirmRemoveGrant}
                disabled={removeBusy}
                className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
              >
                {removeBusy ? 'Removing…' : 'Remove award'}
              </button>
            </div>
          }
        >
          <p className="text-sm">
            Take "<span className="font-medium">{removing.grant.award.name}</span>" back from{' '}
            <span className="font-medium">{removing.grant.user.displayName}</span>?
          </p>
          {removing.impact.total > 0 ? (
            <label className="card-nested mt-3 flex items-start gap-2 rounded-lg p-3 text-sm">
              <input
                type="checkbox"
                checked={removing.removeTokens}
                onChange={(e) => setRemoving({ ...removing, removeTokens: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">
                  Also take back {removing.impact.total} {tokenName}
                </span>
                <span className="block text-xs text-slate-500">
                  {removing.impact.award > 0 && `${removing.impact.award} from the award`}
                  {removing.impact.award > 0 && removing.impact.wheel > 0 && ' · '}
                  {removing.impact.wheel > 0 && `${removing.impact.wheel} from the bonus wheel`}
                  {'. '}
                  Leave this off to keep the {tokenName} and only remove the award itself.
                </span>
              </span>
            </label>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No {tokenName} came with this award, so nothing to take back.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Their notification about this award goes away too. An unspun bonus wheel is cancelled either way.
          </p>
        </Modal>
      )}

      {packsOpen && (
        <AwardPacksModal
          existingNames={awards.map((a) => a.name.toLowerCase())}
          onClose={() => setPacksOpen(false)}
          onDone={async () => {
            setPacksOpen(false);
            await refresh();
          }}
        />
      )}

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
          tokenName={tokenName}
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

export function AwardForm({
  award,
  onClose,
  onSaved,
  kioskToken,
}: {
  award: AwardCatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
  kioskToken?: string;
}) {
  const { alert } = useDialog();
  const [name, setName] = useState(award?.name ?? '');
  const [icon, setIcon] = useState(award?.icon ?? '');
  const [iconMode, setIconMode] = useState<'emoji' | 'upload'>(award?.icon?.startsWith('data:') ? 'upload' : 'emoji');
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(award?.description ?? '');
  const [defaultTokenValue, setDefaultTokenValue] = useState(award?.defaultTokenValue ?? 0);
  // Chance bonus on top of the flat value above - a wheel range and a #5
  // pool are mutually exclusive with EACH OTHER (not with the flat value,
  // which stays independent so existing "tokens + wheel" awards keep working
  // exactly as they do today).
  const [chanceType, setChanceType] = useState<'none' | 'wheel' | 'pool'>(
    award?.pool?.length ? 'pool' : (award?.wheelMax ?? 0) > 0 ? 'wheel' : 'none',
  );
  const [wheelMin, setWheelMin] = useState(award?.wheelMin && award.wheelMin > 0 ? award.wheelMin : 1);
  const [wheelMax, setWheelMax] = useState(award?.wheelMax && award.wheelMax > 0 ? award.wheelMax : 5);
  const [pool, setPool] = useState<PoolEntry[]>(award?.pool ?? []);
  const [gameType, setGameType] = useState<GameType | ''>(award?.gameType ?? '');
  const [slotCount, setSlotCount] = useState(award?.slotCount ?? 6);
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [previewStyle, setPreviewStyle] = useState<GameType | null>(null);
  // Which pool row's prize picker is currently expanded (only one at a time).
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);

  useEffect(() => {
    if (chanceType === 'pool' && prizes.length === 0) api.prizes().then(setPrizes).catch(() => undefined);
  }, [chanceType, prizes.length]);

  // Only prizes explicitly marked "Award only" are poolable - a regular
  // purchasable Store prize doesn't belong in a surprise pool (it's just
  // buyable directly, no game needed to find out).
  const poolablePrizes = prizes.filter((p) => p.visibility === 'AWARD_ONLY');

  function addTokenRow() {
    setPool((p) => [...p, { kind: 'TOKENS', min: 1, max: 5, weight: 1 }]);
  }
  function addPrizeRow() {
    setPool((p) => [...p, { kind: 'PRIZE', prizeId: poolablePrizes[0]?.id ?? '', weight: 1 }]);
    setPickerOpenFor(pool.length); // open the picker on the row that's about to exist
  }
  function updateRow(i: number, patch: Partial<PoolEntry>) {
    setPool((p) => p.map((r, idx) => (idx === i ? ({ ...r, ...patch } as PoolEntry) : r)));
  }
  function removeRow(i: number) {
    setPool((p) => p.filter((_, idx) => idx !== i));
  }
  // Each row's real odds given the others' weights - shown so "weight 3 vs
  // weight 1" isn't just an abstract number an adult has to do math on.
  function poolPercent(i: number): number {
    const total = pool.reduce((s, r) => s + (r.weight ?? 1), 0);
    if (total <= 0) return 0;
    return Math.round(((pool[i]?.weight ?? 1) / total) * 100);
  }

  // Cosmetic range for the preview's wheel/slot-reel animation - same
  // derivation the server uses for the real thing (reward-games.service.ts).
  function previewRange() {
    const tokenEntries = pool.filter((p): p is { kind: 'TOKENS'; min: number; max: number; weight?: number } => p.kind === 'TOKENS');
    if (!tokenEntries.length) return { min: 1, max: 10 };
    return { min: Math.min(...tokenEntries.map((p) => p.min)), max: Math.max(...tokenEntries.map((p) => p.max)) };
  }

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
    const body = {
      name: name.trim(),
      icon: icon.trim(),
      description: description.trim() || undefined,
      defaultTokenValue: chanceType === 'pool' ? 0 : Math.max(0, Math.floor(Number(defaultTokenValue) || 0)),
      wheelMin: Math.max(1, Math.floor(Number(wheelMin) || 1)),
      wheelMax: chanceType === 'wheel' ? Math.max(1, Math.floor(Number(wheelMax) || 1)) : 0,
      pool: chanceType === 'pool' ? pool : null,
      gameType: chanceType === 'pool' && gameType ? gameType : null,
      slotCount: chanceType === 'pool' ? Math.max(2, Math.floor(Number(slotCount) || 6)) : null,
    };
    if (award) await api.updateAward(award.id, body, kioskToken);
    else await api.createAward(body, kioskToken);
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
              <div className="mt-2">
                <IconPicker value={icon} onChange={setIcon} />
              </div>
            ) : (
              <div className="mt-2">
                <input type="file" accept="image/*" onChange={onFile} className="block text-sm" />
                <p className="mt-1 text-xs text-slate-400">
                  Ideal size: 128×128px, square - anything else gets center-cropped to a square automatically.
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

          {chanceType === 'pool' ? (
            <p className="text-xs text-slate-400">
              No flat token value for a Pool award - the pool itself decides what they get, and nothing should be
              banked until they actually play it.
            </p>
          ) : (
            <label className="block text-sm">
              <span className="text-slate-500">Default token value</span>
              <input
                type="number"
                min={0}
                className={`${input} mt-1 w-28`}
                value={defaultTokenValue}
                onChange={(e) => setDefaultTokenValue(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
              />
              <span className="ml-2 text-xs text-slate-400">Pre-fills the amount when giving this award - adjustable each time.</span>
            </label>
          )}

          <div className="rounded border p-3">
            <span className="text-sm font-medium">Chance bonus</span>
            <p className="mt-0.5 text-xs text-slate-400">On top of the flat value above - a wheel range or a pool, never both.</p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={chanceType === 'none'} onChange={() => setChanceType('none')} />
                None
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={chanceType === 'wheel'} onChange={() => setChanceType('wheel')} />
                🎡 Token range (wheel)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={chanceType === 'pool'} onChange={() => setChanceType('pool')} />
                🎮 Pool (new)
              </label>
            </div>

            {chanceType === 'wheel' && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  value={wheelMin}
                  onChange={(e) => setWheelMin(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  className="w-20 rounded border px-2 py-1.5 text-sm"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="number"
                  min={1}
                  value={wheelMax}
                  onChange={(e) => setWheelMax(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  className="w-20 rounded border px-2 py-1.5 text-sm"
                />
                <span className="text-xs text-slate-400">extra tokens, rolled when they spin</span>
              </div>
            )}

            {chanceType === 'pool' && (
              <div className="mt-3 space-y-3">
                <div>
                  <span className="text-xs font-medium text-slate-500">Prize pool - a mix of token ranges and real prizes, each with a relative weight</span>
                  <ul className="mt-1.5 space-y-2">
                    {pool.map((row, i) => {
                      const selectedPrize = row.kind === 'PRIZE' ? prizes.find((p) => p.id === row.prizeId) : undefined; // full `prizes` here, not poolablePrizes - a pool made before a prize got switched to STORE should still show its name
                      return (
                        <li key={i} className="card-nested rounded-lg p-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              {row.kind === 'TOKENS' ? '🪙 Token range' : '🎁 Prize'}
                              <span
                                className="rounded-full px-1.5 py-0.5 font-semibold"
                                style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}
                                title="Chance of this row winning, given every other row's weight"
                              >
                                {poolPercent(i)}%
                              </span>
                            </span>
                            <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-500 hover:text-red-700">
                              Remove
                            </button>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {row.kind === 'TOKENS' ? (
                              <span className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.min}
                                  onChange={(e) => updateRow(i, { min: Number(e.target.value) } as Partial<PoolEntry>)}
                                  onFocus={(e) => e.target.select()}
                                  className="w-16 rounded border px-2 py-1.5 text-sm"
                                />
                                <span className="text-slate-400">to</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={row.max}
                                  onChange={(e) => updateRow(i, { max: Number(e.target.value) } as Partial<PoolEntry>)}
                                  onFocus={(e) => e.target.select()}
                                  className="w-16 rounded border px-2 py-1.5 text-sm"
                                />
                                <span className="text-xs text-slate-400">tokens</span>
                              </span>
                            ) : selectedPrize && pickerOpenFor !== i ? (
                              <button
                                type="button"
                                onClick={() => setPickerOpenFor(i)}
                                className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left hover:bg-slate-50"
                              >
                                <PrizeImage src={selectedPrize.image} alt="" crop={selectedPrize.imageCrop} className="h-10 w-10 shrink-0 rounded" />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{selectedPrize.name}</span>
                                  <span className="block text-xs text-slate-400">
                                    <TokenBadge icon="🪙" amount={selectedPrize.tokenCost} /> · change
                                  </span>
                                </span>
                              </button>
                            ) : (
                              <span className="block text-xs text-amber-600">
                                {poolablePrizes.length === 0 ? 'No award-only prizes yet - mark one "Award only" in the Prizes tab first.' : 'Pick a prize below ↓'}
                              </span>
                            )}

                            <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                              weight
                              <input
                                type="number"
                                min={1}
                                value={row.weight ?? 1}
                                onChange={(e) => updateRow(i, { weight: Number(e.target.value) } as Partial<PoolEntry>)}
                                onFocus={(e) => e.target.select()}
                                className="w-12 rounded border px-1.5 py-1"
                              />
                            </span>
                          </div>

                          {row.kind === 'PRIZE' && pickerOpenFor === i && (
                            <div className="mt-2 grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border p-1.5 sm:grid-cols-3">
                              {poolablePrizes.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    updateRow(i, { prizeId: p.id } as Partial<PoolEntry>);
                                    setPickerOpenFor(null);
                                  }}
                                  className={`flex items-center gap-1.5 rounded-lg border p-1.5 text-left hover:bg-slate-50 ${row.prizeId === p.id ? 'ring-2 ring-slate-800' : ''}`}
                                >
                                  <PrizeImage src={p.image} alt="" crop={p.imageCrop} className="h-8 w-8 shrink-0 rounded" />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-medium">{p.name}</span>
                                    <span className="block text-[10px] text-slate-400">🪙 {p.tokenCost}</span>
                                  </span>
                                </button>
                              ))}
                              {poolablePrizes.length === 0 && (
                                <span className="col-span-full text-xs text-slate-400">
                                  No award-only prizes yet - mark one &quot;Award only&quot; in the Prizes tab first.
                                </span>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {pool.length === 0 && <li className="text-xs text-slate-400">No rows yet - add at least one below.</li>}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={addTokenRow} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                      + Token range
                    </button>
                    <button type="button" onClick={addPrizeRow} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                      + Prize
                    </button>
                  </div>
                </div>

                <label className="block text-xs">
                  <span className="text-slate-500">How many boxes/reels/etc to show</span>
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={slotCount}
                    onChange={(e) => setSlotCount(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="mt-1 w-16 rounded border px-2 py-1"
                  />
                </label>

                <div>
                  <span className="text-xs font-medium text-slate-500">Game type - preview any of these before picking</span>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    <label
                      className={`flex flex-col gap-0.5 rounded-lg border p-1.5 text-[11px] cursor-pointer ${gameType === '' ? 'ring-2 ring-slate-800' : ''}`}
                    >
                      <input type="radio" className="sr-only" checked={gameType === ''} onChange={() => setGameType('')} />
                      <span className="text-base">🎲</span>
                      <span className="font-medium">Surprise me</span>
                      <span className="text-slate-400">Random each time</span>
                    </label>
                    {GAME_TYPES.map((gt) => (
                      <label
                        key={gt}
                        className={`flex flex-col gap-0.5 rounded-lg border p-1.5 text-[11px] cursor-pointer ${gameType === gt ? 'ring-2 ring-slate-800' : ''}`}
                      >
                        <input type="radio" className="sr-only" checked={gameType === gt} onChange={() => setGameType(gt)} />
                        <span className="text-base">{GAME_TYPE_META[gt].icon}</span>
                        <span className="font-medium">{GAME_TYPE_META[gt].label}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setPreviewStyle(gt);
                          }}
                          className="mt-0.5 self-start rounded border px-1 py-0.5 text-[10px] hover:bg-slate-50"
                        >
                          ▶ Preview
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {previewStyle && (
          <RewardRevealModal
            wheel={{
              id: 'preview',
              minTokens: previewRange().min,
              maxTokens: previewRange().max,
              slotCount,
              reason: 'Preview',
              style: previewStyle,
            }}
            tokenName="tokens"
            onSpin={() =>
              fakePreviewRoll(
                pool,
                Object.fromEntries(prizes.map((p) => [p.id, p.name])),
                previewRange().min,
                previewRange().max,
              )
            }
            onClose={() => setPreviewStyle(null)}
          />
        )}
    </Modal>
  );
}

// Exported so the kiosk (Display.tsx) can reuse this exact flow - granting
// an existing award to a kid - instead of only being able to define new
// award catalog entries there.
export function GrantModal({
  award,
  kids,
  tokenName,
  kioskToken,
  onClose,
  onGranted,
}: {
  award: AwardCatalogItem;
  kids: Member[];
  tokenName: string;
  kioskToken?: string;
  onClose: () => void;
  onGranted: (kidName: string, wheelQueued?: boolean) => void;
}) {
  const hasPool = (award.pool?.length ?? 0) > 0;
  const [userId, setUserId] = useState(kids[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [tokenValue, setTokenValue] = useState(hasPool ? 0 : award.defaultTokenValue);
  // This award's wheel, adjustable for THIS handover only - the award's own
  // default range is untouched.
  const [wheelOn, setWheelOn] = useState((award.wheelMax ?? 0) > 0);
  const [wheelMin, setWheelMin] = useState(award.wheelMin && award.wheelMin > 0 ? award.wheelMin : 1);
  const [wheelMax, setWheelMax] = useState(award.wheelMax && award.wheelMax > 0 ? award.wheelMax : 5);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId) return;
    setSaving(true);
    try {
      const res = await api.grantAward(
        award.id,
        {
          userId,
          note: note.trim() || undefined,
          tokenValue: hasPool ? 0 : Math.max(0, Math.floor(Number(tokenValue) || 0)),
          wheelMin: Math.max(1, Math.floor(Number(wheelMin) || 1)),
          wheelMax: wheelOn ? Math.max(1, Math.floor(Number(wheelMax) || 1)) : 0,
        },
        kioskToken,
      );
      // A wheel attached to this award is queued for the KID to spin on their
      // own screen - nothing spins here.
      onGranted(kids.find((k) => k.id === userId)?.displayName ?? 'them', !!res?.wheelQueued);
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
          {(award.wheelMax ?? 0) > 0 && <span className="text-sm font-normal text-slate-400">🎡 has a wheel</span>}
          {(award.pool?.length ?? 0) > 0 && <span className="text-sm font-normal text-slate-400">🎮 has a reward game</span>}
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
        {hasPool ? (
          <p className="text-xs text-slate-400">
            🎮 This award's reward game decides what they get - nothing's banked until they play it.
          </p>
        ) : (
          <label className="block text-sm">
            <span className="text-slate-500">{tokenName}</span>
            <input
              type="number"
              min={0}
              className={`${input} mt-1`}
              value={tokenValue}
              onChange={(e) => setTokenValue(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}

        {!hasPool && (
        <div className="rounded border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wheelOn} onChange={(e) => setWheelOn(e.target.checked)} />
            <span>
              🎡 Include a bonus wheel
              {(award.wheelMax ?? 0) > 0 && <span className="ml-1 text-xs text-slate-400">(this award normally does)</span>}
            </span>
          </label>
          <p className="mt-1 text-xs text-slate-400">
            They spin it themselves on their phone or the kiosk - the amount is decided when they spin.
          </p>
          {wheelOn && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="number"
                min={1}
                value={wheelMin}
                onChange={(e) => setWheelMin(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-20 rounded border px-2 py-1.5 text-sm"
              />
              <span className="text-slate-400">to</span>
              <input
                type="number"
                min={1}
                value={wheelMax}
                onChange={(e) => setWheelMax(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-20 rounded border px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-slate-400">{tokenName}</span>
            </div>
          )}
        </div>
        )}
        <input className={input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

// Award packs go straight into the shared catalog - no "who's this for"
// picker first, unlike chore packs. Skips any badge whose name already
// exists in the catalog so re-opening this after adding a pack once doesn't
// pile up duplicates.
function AwardPacksModal({
  existingNames,
  onClose,
  onDone,
}: {
  existingNames: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function add(packId: string) {
    const pack = AWARD_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    setBusyId(packId);
    try {
      for (const a of pack.awards) {
        if (existingNames.includes(a.name.toLowerCase())) continue;
        await api.createAward({
          name: a.name,
          icon: a.icon,
          description: a.description,
          defaultTokenValue: a.defaultTokenValue,
          wheelMin: a.wheelMin,
          wheelMax: a.wheelMax,
        });
      }
      onDone();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      header={<h3 className="text-lg font-bold">Award packs</h3>}
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
            Close
          </button>
        </div>
      }
      onBackdropClick={onClose}
    >
      <p className="text-sm text-slate-500">
        Add a ready-made set of badges to the catalog. Everything is editable afterwards - names, icons,
        token bonuses, all of it.
      </p>
      <ul className="mt-4 space-y-3">
        {AWARD_PACKS.map((p) => {
          const newCount = p.awards.filter((a) => !existingNames.includes(a.name.toLowerCase())).length;
          return (
            <li key={p.id} className="card-nested rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold">
                    {p.theme} {p.label}
                  </span>
                </div>
                <button
                  disabled={busyId !== null || newCount === 0}
                  onClick={() => add(p.id)}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {busyId === p.id ? 'Adding…' : newCount === 0 ? 'Already added' : `Add ${newCount}`}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">{p.awards.map((a) => `${a.icon} ${a.name}`).join(' · ')}</p>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
