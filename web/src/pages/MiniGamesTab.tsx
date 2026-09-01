import { useEffect, useState, type ReactNode } from 'react';
import {
  api,
  type Member,
  type PoolEntry,
  type MiniGameCatalogItem,
  type PublishedMiniGameItem,
  type MiniGameTierInput,
  type MiniGameConfig,
  type StorePrize,
} from '../api';
import MiniGamesKidView, { PoolBadges } from '../MiniGamesKidView';
import MiniGamePinTumbler from '../MiniGamePinTumbler';
import PoolEditor from '../PoolEditor';
import TokenBadge from '../TokenBadge';
import Modal from '../Modal';

// Shared input look, same as AwardsPage's own form - so a mini-game form
// reads like the rest of the app instead of its own thing.
const input = 'w-full rounded border px-3 py-2 text-sm';

// Consistent labeled-field shell - label above, control below, optional help
// text below that. Same pattern SettingsPage/ChoresPanel already use.
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {help && <span className="mt-0.5 block text-xs text-slate-400">{help}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

// The full ten-game roster from the Task Deck prototypes (PLANNING.md §18)
// - listed here the same way, icon + name, so picking a game type isn't a
// blank slate. `ported` is honest about which ones actually have a real
// playable component wired up yet (see MiniGamePlayer) - the rest still
// create/grant/publish fine, they just show a placeholder instead of the
// real game until they're ported.
const GAME_TYPES: { value: string; label: string; icon: string; ported: boolean }[] = [
  { value: 'PIN_TUMBLER', label: 'Pin & Tumbler', icon: '🗝️', ported: true },
  { value: 'SAFE_CRACKER', label: 'Safe Cracker', icon: '🔐', ported: false },
  { value: 'WIRE_SPLICE', label: 'Wire Splice', icon: '🔌', ported: false },
  { value: 'SIGNAL_RELAY', label: 'Signal Relay', icon: '📡', ported: false },
  { value: 'CARGO_SORT', label: 'Cargo Sort', icon: '📦', ported: false },
  { value: 'FUSE_TRACE', label: 'Fuse Trace', icon: '⚡', ported: false },
  { value: 'REACTOR_CALIBRATION', label: 'Reactor Calibration', icon: '☢️', ported: false },
  { value: 'BUG_ZAPPER', label: 'Bug Zapper', icon: '🪲', ported: false },
  { value: 'CIRCUIT_MATCH', label: 'Circuit Match', icon: '🧩', ported: false },
  { value: 'CODE_BREAKER', label: 'Code Breaker', icon: '💻', ported: false },
];
function gameTypeMeta(value: string) {
  return GAME_TYPES.find((g) => g.value === value) ?? GAME_TYPES[0];
}

// PIN_TUMBLER's own knobs - the only gameType wired to a real playable
// component so far. Generalizes to a per-gameType schema once more games
// port over (PLANNING.md §18 build order).
function ConfigEditor({ config, onChange }: { config: MiniGameConfig; onChange: (c: MiniGameConfig) => void }) {
  const c = config as { steps?: number; timeLimit?: number; misses?: number; difficulty?: number };
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Pins">
        <input type="number" min={3} max={7} value={c.steps ?? 5} onChange={(e) => onChange({ ...c, steps: Number(e.target.value) })} className={input} />
      </Field>
      <Field label="Time limit (s)">
        <input type="number" min={10} max={45} value={c.timeLimit ?? 25} onChange={(e) => onChange({ ...c, timeLimit: Number(e.target.value) })} className={input} />
      </Field>
      <Field label="Misses allowed">
        <input type="number" min={0} max={5} value={c.misses ?? 3} onChange={(e) => onChange({ ...c, misses: Number(e.target.value) })} className={input} />
      </Field>
      <Field label="Difficulty">
        <select value={c.difficulty ?? 1} onChange={(e) => onChange({ ...c, difficulty: Number(e.target.value) })} className={input}>
          <option value={0}>Easy</option>
          <option value={1}>Normal</option>
          <option value={2}>Hard</option>
        </select>
      </Field>
    </div>
  );
}

function ConsolationFields({
  loseTokenValue,
  onLoseTokenValue,
  partialCreditEnabled,
  onPartialCreditEnabled,
  partialCreditPerStep,
  onPartialCreditPerStep,
}: {
  loseTokenValue: number;
  onLoseTokenValue: (n: number) => void;
  partialCreditEnabled: boolean;
  onPartialCreditEnabled: (b: boolean) => void;
  partialCreditPerStep: number;
  onPartialCreditPerStep: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Consolation on loss" help="Flat tokens paid even on a loss">
        <input type="number" min={0} value={loseTokenValue} onChange={(e) => onLoseTokenValue(Number(e.target.value))} className={input} />
      </Field>
      <Field label="Partial credit per pin">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={partialCreditEnabled} onChange={(e) => onPartialCreditEnabled(e.target.checked)} className="h-4 w-4" />
          <input
            type="number"
            min={0}
            value={partialCreditPerStep}
            onChange={(e) => onPartialCreditPerStep(Number(e.target.value))}
            disabled={!partialCreditEnabled}
            className={`${input} disabled:opacity-40`}
          />
        </div>
      </Field>
    </div>
  );
}

function TierEditor({ tiers, onChange, prizes }: { tiers: MiniGameTierInput[]; onChange: (t: MiniGameTierInput[]) => void; prizes: StorePrize[] }) {
  function update(i: number, patch: Partial<MiniGameTierInput>) {
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  return (
    <div className="flex flex-col gap-4">
      {tiers.map((t, i) => (
        <div key={i} className="rounded border bg-white p-3">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label="Tier label">
                <input value={t.label} onChange={(e) => update(i, { label: e.target.value })} className={input} />
              </Field>
            </div>
            <div className="w-28">
              <Field label="Price">
                <input type="number" min={0} value={t.priceTokens} onChange={(e) => update(i, { priceTokens: Number(e.target.value) })} className={input} />
              </Field>
            </div>
            <button onClick={() => onChange(tiers.filter((_, idx) => idx !== i))} className="shrink-0 rounded border px-3 py-2 text-sm text-red-500 hover:bg-red-50">
              Remove
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <ConfigEditor config={t.config} onChange={(config) => update(i, { config })} />
            <PoolEditor pool={t.pool} onChange={(pool) => update(i, { pool })} prizes={prizes} />
            <ConsolationFields
              loseTokenValue={t.loseTokenValue ?? 0}
              onLoseTokenValue={(loseTokenValue) => update(i, { loseTokenValue })}
              partialCreditEnabled={!!t.partialCreditEnabled}
              onPartialCreditEnabled={(partialCreditEnabled) => update(i, { partialCreditEnabled })}
              partialCreditPerStep={t.partialCreditPerStep ?? 0}
              onPartialCreditPerStep={(partialCreditPerStep) => update(i, { partialCreditPerStep })}
            />
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange([...tiers, { label: `Tier ${tiers.length + 1}`, priceTokens: 10, config: { steps: 5, timeLimit: 25, misses: 3, difficulty: 1 }, pool: [{ kind: 'TOKENS', min: 15, max: 30, weight: 1 }] }])}
        className="self-start rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        + Add tier
      </button>
    </div>
  );
}

export default function MiniGamesTab({ isAdult, members, tokenIcon }: { isAdult: boolean; members: Member[]; tokenIcon: string }) {
  const [catalog, setCatalog] = useState<MiniGameCatalogItem[]>([]);
  const [published, setPublished] = useState<PublishedMiniGameItem[]>([]);
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [editing, setEditing] = useState<MiniGameCatalogItem | 'new' | null>(null);
  const [granting, setGranting] = useState<MiniGameCatalogItem | null>(null);
  const [publishing, setPublishing] = useState<MiniGameCatalogItem | null>(null);
  const [editingTiers, setEditingTiers] = useState<PublishedMiniGameItem | null>(null);
  const [previewing, setPreviewing] = useState<MiniGameCatalogItem | null>(null);

  async function refreshAdult() {
    const [c, p, pr] = await Promise.all([api.miniGamesCatalog(), api.publishedMiniGames(), api.prizes()]);
    setCatalog(c);
    setPublished(p);
    // The FULL non-archived list, not pre-filtered to AWARD_ONLY - PoolEditor
    // (shared with AwardsPage) does that filtering itself for its own picker,
    // but still needs the full list to show the name of an already-selected
    // prize even if its visibility later changed to STORE.
    setPrizes(pr.filter((x) => !x.archived));
  }

  useEffect(() => {
    if (isAdult) refreshAdult().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdult]);

  return (
    <div className="flex flex-col gap-8">
      {/* "Games waiting for you" and the buyable Shop are kid-only concepts -
          an adult can't receive a grant (Give-to only targets kids) or
          meaningfully "wait" for one, and showing the real buyable shop here
          just duplicated "Published games" below with none of its admin
          controls. Adults get Catalog + Published games only; kids get this
          view instead, from StorePage passing isAdult=false. */}
      {!isAdult && <MiniGamesKidView tokenIcon={tokenIcon} />}

      {isAdult && (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Catalog</h3>
                <p className="text-xs text-slate-400">Skill-based mini-games you can hand to a kid or publish for them to buy.</p>
              </div>
              <button onClick={() => setEditing('new')} className="shrink-0 rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                + New game
              </button>
            </div>
            {catalog.length === 0 ? (
              <p className="text-sm text-slate-400">No mini-games yet.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.map((g) => (
                  <li key={g.id} className="flex flex-col gap-2 rounded border bg-white p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl leading-none">{g.icon || '🎮'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium leading-tight">{g.name}</div>
                        <div className="text-xs text-slate-400">{gameTypeMeta(g.gameType).label}</div>
                      </div>
                    </div>
                    {g.description && <p className="text-xs text-slate-500">{g.description}</p>}
                    <PoolBadges pool={g.poolJson} tokenIcon={tokenIcon} />
                    <button onClick={() => setGranting(g)} className="mt-1 rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">
                      Give to...
                    </button>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button onClick={() => setPreviewing(g)} className="rounded border px-2.5 py-1 hover:bg-slate-50">
                        Preview
                      </button>
                      <button onClick={() => setEditing(g)} className="rounded border px-2.5 py-1 hover:bg-slate-50">
                        Edit
                      </button>
                      <button onClick={() => setPublishing(g)} className="rounded border px-2.5 py-1 hover:bg-slate-50">
                        Publish...
                      </button>
                      <button
                        onClick={async () => {
                          await api.deleteMiniGame(g.id);
                          refreshAdult();
                        }}
                        className="ml-auto rounded px-2.5 py-1 text-red-500 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-3">
              <h3 className="font-semibold">Published games</h3>
              <p className="text-xs text-slate-400">What kids see under Store → Games.</p>
            </div>
            {published.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing published yet.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {published.map((g) => (
                  <li key={g.id} className="flex flex-col gap-3 rounded border bg-white p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl leading-none">{g.miniGame.icon || '🎮'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium leading-tight">{g.miniGame.name}</div>
                        {g.miniGame.description && <p className="text-xs text-slate-500">{g.miniGame.description}</p>}
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={g.active}
                          onChange={async (e) => {
                            await api.setMiniGamePublishedActive(g.id, e.target.checked);
                            refreshAdult();
                          }}
                          className="h-4 w-4"
                        />
                        Published
                      </label>
                    </div>
                    <p className="text-xs text-slate-400">
                      Limit: {g.purchaseLimitCount}× per {g.purchaseLimitPeriod === 'WEEK' ? 'week' : g.purchaseLimitPeriod === 'MONTH' ? 'month' : 'day'}, per kid
                    </p>
                    <div className="flex flex-col gap-2">
                      {g.tiers.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 rounded border p-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{t.label}</div>
                            <PoolBadges pool={t.poolJson} tokenIcon={tokenIcon} />
                          </div>
                          <TokenBadge icon={tokenIcon} amount={t.priceTokens} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setEditingTiers(g)} className="rounded border px-2.5 py-1 hover:bg-slate-50">
                        Edit tiers
                      </button>
                      <button
                        onClick={async () => {
                          await api.deletePublishedMiniGame(g.id);
                          refreshAdult();
                        }}
                        className="ml-auto rounded px-2.5 py-1 text-red-500 hover:bg-red-50"
                      >
                        Unpublish
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {editing && (
        <MiniGameFormModal
          game={editing === 'new' ? null : editing}
          prizes={prizes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshAdult();
          }}
        />
      )}
      {granting && (
        <GrantModal
          game={granting}
          members={members.filter((m) => m.role === 'KID')}
          prizes={prizes}
          onClose={() => setGranting(null)}
          onGranted={() => setGranting(null)}
        />
      )}
      {publishing && (
        <PublishModal game={publishing} prizes={prizes} onClose={() => setPublishing(null)} onPublished={() => { setPublishing(null); refreshAdult(); }} />
      )}
      {editingTiers && (
        <EditTiersModal published={editingTiers} prizes={prizes} onClose={() => setEditingTiers(null)} onSaved={() => { setEditingTiers(null); refreshAdult(); }} />
      )}
      {previewing && <PreviewModal game={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
}

// No-stakes preview - no grant/purchase row, no ledger entry, no real pool
// draw, just the actual game component fed the catalog's own settings.
// Only PIN_TUMBLER has a real component wired up yet (MiniGamePlayer's own
// fallback message covers the rest consistently).
function PreviewModal({ game, onClose }: { game: MiniGameCatalogItem; onClose: () => void }) {
  const [key, setKey] = useState(0); // bump to remount = "play again"
  const [result, setResult] = useState<{ won: boolean } | null>(null);
  const meta = gameTypeMeta(game.gameType);

  return (
    <Modal
      maxWidthClass="max-w-lg"
      onBackdropClick={onClose}
      header={
        <h3 className="text-lg font-semibold">
          Preview - {game.icon || meta.icon} {game.name}
        </h3>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Close
          </button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-slate-400">No tokens, no prize, no grant used - just trying the settings out.</p>
      {!meta.ported ? (
        <p className="rounded border p-6 text-center text-sm text-slate-500">
          {meta.label} hasn't been ported into the real app yet - it's playable in the Task Deck prototype for now.
        </p>
      ) : result ? (
        <div className="flex flex-col items-center gap-3 rounded border bg-white p-6 text-center">
          <div className="text-xl font-bold" style={{ color: result.won ? '#16a34a' : '#dc2626' }}>
            {result.won ? 'Would have won!' : 'Would have lost.'}
          </div>
          <button
            onClick={() => {
              setResult(null);
              setKey((k) => k + 1);
            }}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Play again
          </button>
        </div>
      ) : (
        <MiniGamePinTumbler key={key} config={game.configJson} onFinish={(r) => setResult({ won: r.won })} />
      )}
    </Modal>
  );
}

function MiniGameFormModal({
  game,
  prizes,
  onClose,
  onSaved,
}: {
  game: MiniGameCatalogItem | null;
  prizes: StorePrize[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gameType, setGameType] = useState(game?.gameType ?? 'PIN_TUMBLER');
  const [name, setName] = useState(game?.name ?? gameTypeMeta(gameType).label);
  const [icon, setIcon] = useState(game?.icon ?? gameTypeMeta(gameType).icon);
  const [description, setDescription] = useState(game?.description ?? '');
  const [config, setConfig] = useState<MiniGameConfig>(game?.configJson ?? { steps: 5, timeLimit: 25, misses: 3, difficulty: 1 });
  const [pool, setPool] = useState<PoolEntry[]>(game?.poolJson ?? [{ kind: 'TOKENS', min: 10, max: 25, weight: 1 }]);
  const [loseTokenValue, setLoseTokenValue] = useState(game?.loseTokenValue ?? 0);
  const [partialCreditEnabled, setPartialCreditEnabled] = useState(game?.partialCreditEnabled ?? false);
  const [partialCreditPerStep, setPartialCreditPerStep] = useState(game?.partialCreditPerStep ?? 0);
  const [saving, setSaving] = useState(false);

  // Picking a type on a brand-new (unsaved) game fills in its default
  // icon/name - not a blank slate - but never overwrites what's already
  // been typed for an existing one.
  function pickGameType(next: string) {
    setGameType(next);
    if (!game) {
      const meta = gameTypeMeta(next);
      setName(meta.label);
      setIcon(meta.icon);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      const body = { name, icon, description, gameType, config, pool, loseTokenValue, partialCreditEnabled, partialCreditPerStep };
      if (game) await api.updateMiniGame(game.id, body);
      else await api.createMiniGame(body);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      maxWidthClass="max-w-lg"
      onClose={onClose}
      header={<h3 className="text-lg font-semibold">{game ? 'Edit mini-game' : 'New mini-game'}</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !name.trim() || pool.length === 0} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Game">
          <select value={gameType} onChange={(e) => pickGameType(e.target.value)} className={input}>
            {GAME_TYPES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.icon} {g.label}
                {g.ported ? '' : ' (not ported yet)'}
              </option>
            ))}
          </select>
          {!gameTypeMeta(gameType).ported && (
            <p className="mt-1.5 text-xs text-amber-600">
              Still only a prototype - this'll create/grant/publish fine, but kids see a placeholder instead of the real game until it's ported in.
            </p>
          )}
        </Field>
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <Field label="Icon">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={`${input} text-center`} />
          </Field>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </Field>
        </div>
        <Field label="Description" help="Optional">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={input} />
        </Field>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Default settings</h4>
          <ConfigEditor config={config} onChange={setConfig} />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Default prize pool</h4>
          <PoolEditor pool={pool} onChange={setPool} prizes={prizes} />
        </div>
        <ConsolationFields
          loseTokenValue={loseTokenValue}
          onLoseTokenValue={setLoseTokenValue}
          partialCreditEnabled={partialCreditEnabled}
          onPartialCreditEnabled={setPartialCreditEnabled}
          partialCreditPerStep={partialCreditPerStep}
          onPartialCreditPerStep={setPartialCreditPerStep}
        />
      </div>
    </Modal>
  );
}

function GrantModal({
  game,
  members,
  prizes,
  onClose,
  onGranted,
}: {
  game: MiniGameCatalogItem;
  members: Member[];
  prizes: StorePrize[];
  onClose: () => void;
  onGranted: () => void;
}) {
  const [userId, setUserId] = useState(members[0]?.id ?? '');
  const [config, setConfig] = useState<MiniGameConfig>(game.configJson);
  const [pool, setPool] = useState<PoolEntry[]>(game.poolJson);
  const [loseTokenValue, setLoseTokenValue] = useState(game.loseTokenValue);
  const [partialCreditEnabled, setPartialCreditEnabled] = useState(game.partialCreditEnabled);
  const [partialCreditPerStep, setPartialCreditPerStep] = useState(game.partialCreditPerStep);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId) return;
    setSaving(true);
    try {
      await api.grantMiniGame(game.id, { userId, config, pool, loseTokenValue, partialCreditEnabled, partialCreditPerStep });
      onGranted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      maxWidthClass="max-w-lg"
      onClose={onClose}
      header={
        <h3 className="text-lg font-semibold">
          Give "{game.name}" to...
        </h3>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !userId} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Giving…' : 'Give it'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {members.length === 0 ? (
          <p className="text-sm text-slate-400">No kids on this family yet.</p>
        ) : (
          <Field label="Kid">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={input}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <p className="text-xs text-slate-400">Prefilled from the catalog defaults - edit freely, only this one play uses it.</p>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Settings</h4>
          <ConfigEditor config={config} onChange={setConfig} />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Prize pool</h4>
          <PoolEditor pool={pool} onChange={setPool} prizes={prizes} />
        </div>
        <ConsolationFields
          loseTokenValue={loseTokenValue}
          onLoseTokenValue={setLoseTokenValue}
          partialCreditEnabled={partialCreditEnabled}
          onPartialCreditEnabled={setPartialCreditEnabled}
          partialCreditPerStep={partialCreditPerStep}
          onPartialCreditPerStep={setPartialCreditPerStep}
        />
      </div>
    </Modal>
  );
}

// One published game's purchase rate limit - per user, same cap for
// everyone in the family (decided 2026-09-01). Lives on the published game
// itself, not per-tier - buying any tier counts against the same cap.
function PurchaseLimitField({
  count,
  period,
  onChangeCount,
  onChangePeriod,
}: {
  count: number;
  period: string;
  onChangeCount: (n: number) => void;
  onChangePeriod: (p: string) => void;
}) {
  return (
    <Field label="Purchase limit" help="How many times any one kid can buy a play of this game, before it's locked until the next period. Same cap for everyone.">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={count}
          onChange={(e) => onChangeCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          onFocus={(e) => e.target.select()}
          className="w-20 rounded border px-2 py-1.5 text-sm"
        />
        <span className="text-sm text-slate-500">times per</span>
        <select value={period} onChange={(e) => onChangePeriod(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
          <option value="DAY">day</option>
          <option value="WEEK">week</option>
          <option value="MONTH">month</option>
        </select>
      </div>
    </Field>
  );
}

function PublishModal({ game, prizes, onClose, onPublished }: { game: MiniGameCatalogItem; prizes: StorePrize[]; onClose: () => void; onPublished: () => void }) {
  const [tiers, setTiers] = useState<MiniGameTierInput[]>([
    { label: 'Easy', priceTokens: 10, config: { ...game.configJson, difficulty: 0 }, pool: game.poolJson, loseTokenValue: game.loseTokenValue, partialCreditEnabled: game.partialCreditEnabled, partialCreditPerStep: game.partialCreditPerStep },
    { label: 'Normal', priceTokens: 20, config: { ...game.configJson, difficulty: 1 }, pool: game.poolJson, loseTokenValue: game.loseTokenValue, partialCreditEnabled: game.partialCreditEnabled, partialCreditPerStep: game.partialCreditPerStep },
    { label: 'Hard', priceTokens: 30, config: { ...game.configJson, difficulty: 2 }, pool: game.poolJson, loseTokenValue: game.loseTokenValue, partialCreditEnabled: game.partialCreditEnabled, partialCreditPerStep: game.partialCreditPerStep },
  ]);
  const [limitCount, setLimitCount] = useState(1);
  const [limitPeriod, setLimitPeriod] = useState('DAY');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.publishMiniGame(game.id, tiers, limitCount, limitPeriod);
      onPublished();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      maxWidthClass="max-w-2xl"
      onClose={onClose}
      header={<h3 className="text-lg font-semibold">Publish "{game.name}"</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || tiers.length === 0} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-400">Started with Easy/Normal/Hard - edit, remove, or add as many tiers as you want. Each has its own price, settings, pool, and consolation.</p>
        <PurchaseLimitField count={limitCount} period={limitPeriod} onChangeCount={setLimitCount} onChangePeriod={setLimitPeriod} />
        <TierEditor tiers={tiers} onChange={setTiers} prizes={prizes} />
      </div>
    </Modal>
  );
}

function EditTiersModal({ published, prizes, onClose, onSaved }: { published: PublishedMiniGameItem; prizes: StorePrize[]; onClose: () => void; onSaved: () => void }) {
  const [tiers, setTiers] = useState<MiniGameTierInput[]>(
    published.tiers.map((t) => ({ label: t.label, priceTokens: t.priceTokens, config: t.configJson, pool: t.poolJson, loseTokenValue: t.loseTokenValue, partialCreditEnabled: t.partialCreditEnabled, partialCreditPerStep: t.partialCreditPerStep })),
  );
  const [limitCount, setLimitCount] = useState(published.purchaseLimitCount);
  const [limitPeriod, setLimitPeriod] = useState<string>(published.purchaseLimitPeriod);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.updateMiniGameTiers(published.id, tiers, limitCount, limitPeriod);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      maxWidthClass="max-w-2xl"
      onClose={onClose}
      header={<h3 className="text-lg font-semibold">Edit tiers - {published.miniGame.name}</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || tiers.length === 0} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save tiers'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <PurchaseLimitField count={limitCount} period={limitPeriod} onChangeCount={setLimitCount} onChangePeriod={setLimitPeriod} />
        <TierEditor tiers={tiers} onChange={setTiers} prizes={prizes} />
      </div>
    </Modal>
  );
}
