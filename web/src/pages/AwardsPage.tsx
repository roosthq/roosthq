import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, type AwardCatalogItem, type AwardGrantHistoryItem, type Member, type PoolEntry, type GameType, type StorePrize } from '../api';
import { useDialog } from '../Dialog';
import Modal from '../Modal';
import TokenBadge from '../TokenBadge';
import PoolEditor from '../PoolEditor';
import IconPicker from '../IconPicker';
import { formatDateTime } from '../dateFormat';
import { AWARD_PACKS } from '../awardPacks';
import { GAME_TYPES, GAME_TYPE_META, fakePreviewRoll } from '../rewardGames';
import RewardRevealModal from '../RewardRevealModal';
import LucideIcon from '../LucideIcon';
import { usePaginatedList } from '../usePaginatedList';
import LoadMoreButton from '../LoadMoreButton';

// Icons are either a Lucide icon name or an uploaded image (data: URI) -
// render whichever one it is consistently wherever an award shows up.
// `size` is a pixel dimension (not a Tailwind className - an SVG icon's
// size isn't controlled by font-size the way the old emoji <span> was).
export function AwardIcon({ icon, size = 24 }: { icon: string | null; size?: number }) {
  if (icon?.startsWith('data:')) return <img src={icon} alt="" className="h-7 w-7 rounded object-cover" />;
  return <LucideIcon name={icon || 'trophy'} size={size} />;
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
  const [historyOpen, setHistoryOpen] = useState(false);
  // Gated on historyOpen inside the fetcher (empty page while closed) so
  // this only ever fetches once the section's actually been opened.
  const historyPage = usePaginatedList((skip) => (historyOpen ? api.awardHistory(skip) : Promise.resolve({ items: [], hasMore: false })), [historyOpen]);
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
    if (historyOpen) historyPage.reload();
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
      if (historyOpen) historyPage.reload();
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
                <AwardIcon icon={a.icon} size={24} />
                <span className="min-w-0 break-words font-medium">{a.name}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">given {a.grantCount}×</span>
            </div>
            {a.description && <p className="mt-1 text-sm text-slate-500">{a.description}</p>}
            {(a.defaultTokenValue > 0 || a.defaultStreakFreezeValue > 0 || (a.wheelMax ?? 0) > 0 || (a.pool?.length ?? 0) > 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {a.defaultTokenValue > 0 && <TokenBadge icon={tokenIcon} amount={a.defaultTokenValue} />}
                {a.defaultStreakFreezeValue > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}
                  >
                    🧊 {a.defaultStreakFreezeValue}
                  </span>
                )}
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
          {historyOpen ? '▾' : '▸'} History{historyOpen ? ` (${historyPage.items.length}${historyPage.hasMore ? '+' : ''})` : ''}
        </button>
        {historyOpen && (
          <>
          <ul className="mt-3 space-y-2">
            {historyPage.items.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white p-3 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <AwardIcon icon={g.award.icon} size={20} />
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
                  {g.streakFreezeValue > 0 && <span className="text-xs font-medium">🧊 {g.streakFreezeValue}</span>}
                  <button onClick={() => askRemoveGrant(g)} className="text-xs text-red-500 hover:text-red-700">
                    Remove
                  </button>
                </span>
              </li>
            ))}
            {!historyPage.loading && historyPage.items.length === 0 && <li className="text-sm text-slate-400">No awards given yet.</li>}
          </ul>
          <LoadMoreButton hasMore={historyPage.hasMore} loading={historyPage.loadingMore} onClick={historyPage.loadMore} />
          </>
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
            if (historyOpen) historyPage.reload();
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
  const [defaultStreakFreezeValue, setDefaultStreakFreezeValue] = useState(award?.defaultStreakFreezeValue ?? 0);
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

  useEffect(() => {
    if (chanceType === 'pool' && prizes.length === 0) api.prizes().then(setPrizes).catch(() => undefined);
  }, [chanceType, prizes.length]);

  // Cosmetic range for the preview's wheel/slot-reel animation - same
  // derivation the server uses for the real thing (reward-games.service.ts).
  function previewRange() {
    const rangedEntries = pool.filter(
      (p): p is { kind: 'TOKENS' | 'STREAK_FREEZE'; min: number; max: number; weight?: number } =>
        p.kind === 'TOKENS' || p.kind === 'STREAK_FREEZE',
    );
    if (!rangedEntries.length) return { min: 1, max: 10 };
    return { min: Math.min(...rangedEntries.map((p) => p.min)), max: Math.max(...rangedEntries.map((p) => p.max)) };
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
      defaultStreakFreezeValue: chanceType === 'pool' ? 0 : Math.max(0, Math.floor(Number(defaultStreakFreezeValue) || 0)),
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
      onClose={onClose}
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
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
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
              No flat token/freeze value for a Pool award - the pool itself decides what they get, and nothing should
              be banked until they actually play it.
            </p>
          ) : (
            <>
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
              <label className="block text-sm">
                <span className="text-slate-500">🧊 Default streak freeze value</span>
                <input
                  type="number"
                  min={0}
                  className={`${input} mt-1 w-28`}
                  value={defaultStreakFreezeValue}
                  onChange={(e) => setDefaultStreakFreezeValue(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                />
                <span className="ml-2 text-xs text-slate-400">Independent of the token value above - an award can give either, both, or neither.</span>
              </label>
            </>
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

            {/* flex-wrap - without it this fractures into independently-
                wrapping pieces around the two inputs instead of the
                phrase wrapping as a whole (same bug as the chore form's
                streak-bonus sentence). */}
            {chanceType === 'wheel' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
                <PoolEditor pool={pool} onChange={setPool} prizes={prizes} />

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
                  {/* Bigger tiles (2-up on a phone, not 3, so nothing's cramped),
                      rem-based text so it actually grows with the account's font
                      size setting (the old text-[11px] didn't), and a filled
                      accent background + checkmark badge on the selected tile
                      instead of just a subtle ring - kids couldn't tell which
                      one was picked at a glance. */}
                  <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    <label
                      className="relative flex flex-col gap-1 rounded-lg border p-3 text-sm cursor-pointer"
                      style={
                        gameType === ''
                          ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--surface-raised) 78%, var(--accent) 22%)' }
                          : undefined
                      }
                    >
                      <input type="radio" className="sr-only" checked={gameType === ''} onChange={() => setGameType('')} />
                      {gameType === '' && <LucideIcon name="check-circle" size={18} className="absolute right-2 top-2" />}
                      <LucideIcon name="dice-5" size={28} />
                      <span className="font-medium">Surprise me</span>
                      <span className="text-xs text-slate-400">Random each time</span>
                    </label>
                    {GAME_TYPES.map((gt) => (
                      <label
                        key={gt}
                        className="relative flex flex-col gap-1 rounded-lg border p-3 text-sm cursor-pointer"
                        style={
                          gameType === gt
                            ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--surface-raised) 78%, var(--accent) 22%)' }
                            : undefined
                        }
                      >
                        <input type="radio" className="sr-only" checked={gameType === gt} onChange={() => setGameType(gt)} />
                        {gameType === gt && <LucideIcon name="check-circle" size={18} className="absolute right-2 top-2" />}
                        <LucideIcon name={GAME_TYPE_META[gt].icon} slot={`game.${gt}`} size={28} />
                        <span className="font-medium">{GAME_TYPE_META[gt].label}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setPreviewStyle(gt);
                          }}
                          className="mt-0.5 self-start rounded border px-2 py-1 text-xs hover:bg-slate-50"
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
  const [streakFreezeValue, setStreakFreezeValue] = useState(hasPool ? 0 : award.defaultStreakFreezeValue);
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
          streakFreezeValue: hasPool ? 0 : Math.max(0, Math.floor(Number(streakFreezeValue) || 0)),
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
      onClose={onClose}
      header={
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <AwardIcon icon={award.icon} />
          Give "{award.name}"
          {(award.wheelMax ?? 0) > 0 && <span className="text-sm font-normal text-slate-400">🎡 has a wheel</span>}
          {(award.pool?.length ?? 0) > 0 && <span className="text-sm font-normal text-slate-400">🎮 has a reward game</span>}
          {award.defaultStreakFreezeValue > 0 && <span className="text-sm font-normal text-slate-400">🧊 has a freeze</span>}
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
          <label className="block text-sm">
            <span className="text-slate-500">🧊 Streak freezes</span>
            <input
              type="number"
              min={0}
              className={`${input} mt-1`}
              value={streakFreezeValue}
              onChange={(e) => setStreakFreezeValue(Number(e.target.value))}
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
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
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <LucideIcon name={p.theme} size={16} />
                    {p.label}
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
