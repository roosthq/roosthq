import { useEffect, useState } from 'react';
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
import MiniGamesKidView from '../MiniGamesKidView';
import Modal from '../Modal';

const GAME_TYPES: { value: string; label: string }[] = [
  { value: 'PIN_TUMBLER', label: 'Pin & Tumbler (Lock Pick)' },
];

function prizeSummary(pool: PoolEntry[]): string {
  return pool
    .map((p) => (p.kind === 'TOKENS' ? `${p.min}-${p.max} tokens` : p.kind === 'STREAK_FREEZE' ? `${p.min}-${p.max} freeze` : 'a prize'))
    .join(' · ');
}

// Compact pool editor - same PoolEntry shape/interaction as AwardsPage's
// pool builder, written standalone rather than extracted from that file
// (bigger, higher-risk refactor of an already-shipped feature for a small
// win). Rows: TOKENS/STREAK_FREEZE (min/max/weight) or PRIZE (pick from the
// AWARD_ONLY-visible catalog, same as Award's own pool can).
function PoolEditor({ pool, onChange, prizes }: { pool: PoolEntry[]; onChange: (p: PoolEntry[]) => void; prizes: StorePrize[] }) {
  function update(i: number, patch: Partial<PoolEntry>) {
    onChange(pool.map((r, idx) => (idx === i ? ({ ...r, ...patch } as PoolEntry) : r)));
  }
  function remove(i: number) {
    onChange(pool.filter((_, idx) => idx !== i));
  }
  return (
    <div className="flex flex-col gap-2">
      {pool.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs">
          <select
            value={row.kind}
            onChange={(e) => {
              const kind = e.target.value as PoolEntry['kind'];
              if (kind === 'PRIZE') update(i, { kind, prizeId: prizes[0]?.id ?? '' } as Partial<PoolEntry>);
              else update(i, { kind, min: 1, max: 5 } as Partial<PoolEntry>);
            }}
            className="rounded border px-1.5 py-1"
          >
            <option value="TOKENS">Tokens</option>
            <option value="STREAK_FREEZE">Streak freeze</option>
            <option value="PRIZE">Prize</option>
          </select>
          {row.kind === 'PRIZE' ? (
            <select value={row.prizeId} onChange={(e) => update(i, { prizeId: e.target.value } as Partial<PoolEntry>)} className="rounded border px-1.5 py-1">
              {prizes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="number" min={0} value={row.min} onChange={(e) => update(i, { min: Number(e.target.value) } as Partial<PoolEntry>)} className="w-16 rounded border px-1.5 py-1" />
              <span>to</span>
              <input type="number" min={0} value={row.max} onChange={(e) => update(i, { max: Number(e.target.value) } as Partial<PoolEntry>)} className="w-16 rounded border px-1.5 py-1" />
            </>
          )}
          <span className="text-slate-400">weight</span>
          <input type="number" min={1} value={row.weight ?? 1} onChange={(e) => update(i, { weight: Number(e.target.value) } as Partial<PoolEntry>)} className="w-14 rounded border px-1.5 py-1" />
          <button onClick={() => remove(i)} className="ml-auto text-slate-400 hover:text-red-500">
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => onChange([...pool, { kind: 'TOKENS', min: 5, max: 15, weight: 1 }])} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
          + Tokens
        </button>
        <button onClick={() => onChange([...pool, { kind: 'STREAK_FREEZE', min: 1, max: 1, weight: 1 }])} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
          + Freeze
        </button>
        {prizes.length > 0 && (
          <button onClick={() => onChange([...pool, { kind: 'PRIZE', prizeId: prizes[0].id, weight: 1 }])} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
            + Prize
          </button>
        )}
      </div>
    </div>
  );
}

// PIN_TUMBLER's own knobs - the only gameType wired to a real playable
// component so far. Generalizes to a per-gameType schema once more games
// port over (PLANNING.md §18 build order).
function ConfigEditor({ config, onChange }: { config: MiniGameConfig; onChange: (c: MiniGameConfig) => void }) {
  const c = config as { steps?: number; timeLimit?: number; misses?: number; difficulty?: number };
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <label className="flex flex-col gap-1">
        Pins
        <input type="number" min={3} max={7} value={c.steps ?? 5} onChange={(e) => onChange({ ...c, steps: Number(e.target.value) })} className="rounded border px-1.5 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Time limit (s)
        <input type="number" min={10} max={45} value={c.timeLimit ?? 25} onChange={(e) => onChange({ ...c, timeLimit: Number(e.target.value) })} className="rounded border px-1.5 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Misses allowed
        <input type="number" min={0} max={5} value={c.misses ?? 3} onChange={(e) => onChange({ ...c, misses: Number(e.target.value) })} className="rounded border px-1.5 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Difficulty
        <select value={c.difficulty ?? 1} onChange={(e) => onChange({ ...c, difficulty: Number(e.target.value) })} className="rounded border px-1.5 py-1">
          <option value={0}>Easy</option>
          <option value={1}>Normal</option>
          <option value={2}>Hard</option>
        </select>
      </label>
    </div>
  );
}

function TierEditor({ tiers, onChange, prizes }: { tiers: MiniGameTierInput[]; onChange: (t: MiniGameTierInput[]) => void; prizes: StorePrize[] }) {
  function update(i: number, patch: Partial<MiniGameTierInput>) {
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  return (
    <div className="flex flex-col gap-3">
      {tiers.map((t, i) => (
        <div key={i} className="rounded border p-3">
          <div className="mb-2 flex items-center gap-2">
            <input value={t.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Tier label" className="rounded border px-2 py-1 text-sm" />
            <span className="text-xs text-slate-500">Price</span>
            <input type="number" min={0} value={t.priceTokens} onChange={(e) => update(i, { priceTokens: Number(e.target.value) })} className="w-20 rounded border px-1.5 py-1 text-sm" />
            <button onClick={() => onChange(tiers.filter((_, idx) => idx !== i))} className="ml-auto text-slate-400 hover:text-red-500">
              Remove tier
            </button>
          </div>
          <ConfigEditor config={t.config} onChange={(config) => update(i, { config })} />
          <div className="mt-2">
            <PoolEditor pool={t.pool} onChange={(pool) => update(i, { pool })} prizes={prizes} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              Consolation on loss
              <input type="number" min={0} value={t.loseTokenValue ?? 0} onChange={(e) => update(i, { loseTokenValue: Number(e.target.value) })} className="w-16 rounded border px-1.5 py-1" />
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={!!t.partialCreditEnabled} onChange={(e) => update(i, { partialCreditEnabled: e.target.checked })} />
              Partial credit/pin
            </label>
            {t.partialCreditEnabled && (
              <input type="number" min={0} value={t.partialCreditPerStep ?? 0} onChange={(e) => update(i, { partialCreditPerStep: Number(e.target.value) })} className="w-16 rounded border px-1.5 py-1" />
            )}
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

export default function MiniGamesTab({ isAdult, members }: { isAdult: boolean; members: Member[] }) {
  const [catalog, setCatalog] = useState<MiniGameCatalogItem[]>([]);
  const [published, setPublished] = useState<PublishedMiniGameItem[]>([]);
  const [prizes, setPrizes] = useState<StorePrize[]>([]);
  const [editing, setEditing] = useState<MiniGameCatalogItem | 'new' | null>(null);
  const [granting, setGranting] = useState<MiniGameCatalogItem | null>(null);
  const [publishing, setPublishing] = useState<MiniGameCatalogItem | null>(null);
  const [editingTiers, setEditingTiers] = useState<PublishedMiniGameItem | null>(null);

  async function refreshAdult() {
    const [c, p, pr] = await Promise.all([api.miniGamesCatalog(), api.publishedMiniGames(), api.prizes()]);
    setCatalog(c);
    setPublished(p);
    setPrizes(pr.filter((x) => !x.archived));
  }

  useEffect(() => {
    if (isAdult) refreshAdult().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdult]);

  return (
    <div className="flex flex-col gap-6">
      <MiniGamesKidView />

      {isAdult && (
        <>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Catalog</h3>
              <button onClick={() => setEditing('new')} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                + New game
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {catalog.map((g) => (
                <li key={g.id} className="panel flex flex-wrap items-center gap-2 p-3">
                  <span className="text-xl">{g.icon || '🎮'}</span>
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-xs text-slate-400">{prizeSummary(g.poolJson)}</span>
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => setEditing(g)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                      Edit
                    </button>
                    <button onClick={() => setGranting(g)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                      Give to...
                    </button>
                    <button onClick={() => setPublishing(g)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                      Publish...
                    </button>
                    <button
                      onClick={async () => {
                        await api.deleteMiniGame(g.id);
                        refreshAdult();
                      }}
                      className="rounded border px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {catalog.length === 0 && <p className="text-sm text-slate-400">No mini-games yet.</p>}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Published games - what kids see</h3>
            <ul className="flex flex-col gap-3">
              {published.map((g) => (
                <li key={g.id} className="panel p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl">{g.miniGame.icon || '🎮'}</span>
                    <span className="font-semibold">{g.miniGame.name}</span>
                    <label className="ml-auto flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={g.active}
                        onChange={async (e) => {
                          await api.setMiniGamePublishedActive(g.id, e.target.checked);
                          refreshAdult();
                        }}
                      />
                      Published
                    </label>
                    <button onClick={() => setEditingTiers(g)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                      Edit tiers
                    </button>
                    <button
                      onClick={async () => {
                        await api.deletePublishedMiniGame(g.id);
                        refreshAdult();
                      }}
                      className="rounded border px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Unpublish
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.tiers.map((t) => (
                      <div key={t.id} className="rounded border p-2 text-xs">
                        <div className="font-semibold">
                          {t.label} - {t.priceTokens} tokens
                        </div>
                        <div className="text-slate-500">{prizeSummary(t.poolJson)}</div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
              {published.length === 0 && <p className="text-sm text-slate-400">Nothing published yet.</p>}
            </ul>
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
    </div>
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
  const [name, setName] = useState(game?.name ?? '');
  const [icon, setIcon] = useState(game?.icon ?? '🔐');
  const [description, setDescription] = useState(game?.description ?? '');
  const [config, setConfig] = useState<MiniGameConfig>(game?.configJson ?? { steps: 5, timeLimit: 25, misses: 3, difficulty: 1 });
  const [pool, setPool] = useState<PoolEntry[]>(game?.poolJson ?? [{ kind: 'TOKENS', min: 10, max: 25, weight: 1 }]);
  const [loseTokenValue, setLoseTokenValue] = useState(game?.loseTokenValue ?? 0);
  const [partialCreditEnabled, setPartialCreditEnabled] = useState(game?.partialCreditEnabled ?? false);
  const [partialCreditPerStep, setPartialCreditPerStep] = useState(game?.partialCreditPerStep ?? 0);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const body = { name, icon, description, gameType: 'PIN_TUMBLER', config, pool, loseTokenValue, partialCreditEnabled, partialCreditPerStep };
      if (game) await api.updateMiniGame(game.id, body);
      else await api.createMiniGame(body);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
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
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-14 rounded border px-2 py-1 text-center" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 rounded border px-2 py-1" />
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded border px-2 py-1 text-sm" />
        <label className="flex flex-col gap-1 text-sm">
          Game
          <select className="rounded border px-2 py-1" disabled value="PIN_TUMBLER" onChange={() => undefined}>
            {GAME_TYPES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="mb-1 text-sm font-semibold">Default settings</div>
          <ConfigEditor config={config} onChange={setConfig} />
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Default prize pool</div>
          <PoolEditor pool={pool} onChange={setPool} prizes={prizes} />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            Consolation on loss
            <input type="number" min={0} value={loseTokenValue} onChange={(e) => setLoseTokenValue(Number(e.target.value))} className="w-20 rounded border px-1.5 py-1" />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={partialCreditEnabled} onChange={(e) => setPartialCreditEnabled(e.target.checked)} />
            Partial credit per pin
          </label>
          {partialCreditEnabled && (
            <input type="number" min={0} value={partialCreditPerStep} onChange={(e) => setPartialCreditPerStep(Number(e.target.value))} className="w-16 rounded border px-1.5 py-1" />
          )}
        </div>
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
      header={<h3 className="text-lg font-semibold">Give "{game.name}" to...</h3>}
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
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Kid
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded border px-2 py-1">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">Prefilled from the catalog defaults - edit freely, only this one play uses it.</p>
        <ConfigEditor config={config} onChange={setConfig} />
        <PoolEditor pool={pool} onChange={setPool} prizes={prizes} />
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            Consolation on loss
            <input type="number" min={0} value={loseTokenValue} onChange={(e) => setLoseTokenValue(Number(e.target.value))} className="w-20 rounded border px-1.5 py-1" />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={partialCreditEnabled} onChange={(e) => setPartialCreditEnabled(e.target.checked)} />
            Partial credit per pin
          </label>
          {partialCreditEnabled && (
            <input type="number" min={0} value={partialCreditPerStep} onChange={(e) => setPartialCreditPerStep(Number(e.target.value))} className="w-16 rounded border px-1.5 py-1" />
          )}
        </div>
      </div>
    </Modal>
  );
}

function PublishModal({ game, prizes, onClose, onPublished }: { game: MiniGameCatalogItem; prizes: StorePrize[]; onClose: () => void; onPublished: () => void }) {
  const [tiers, setTiers] = useState<MiniGameTierInput[]>([
    { label: 'Easy', priceTokens: 10, config: { ...game.configJson, difficulty: 0 }, pool: game.poolJson, loseTokenValue: game.loseTokenValue, partialCreditEnabled: game.partialCreditEnabled, partialCreditPerStep: game.partialCreditPerStep },
    { label: 'Normal', priceTokens: 20, config: { ...game.configJson, difficulty: 1 }, pool: game.poolJson, loseTokenValue: game.loseTokenValue, partialCreditEnabled: game.partialCreditEnabled, partialCreditPerStep: game.partialCreditPerStep },
    { label: 'Hard', priceTokens: 30, config: { ...game.configJson, difficulty: 2 }, pool: game.poolJson, loseTokenValue: game.loseTokenValue, partialCreditEnabled: game.partialCreditEnabled, partialCreditPerStep: game.partialCreditPerStep },
  ]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.publishMiniGame(game.id, tiers);
      onPublished();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
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
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">Started with Easy/Normal/Hard - edit, remove, or add as many tiers as you want. Each has its own price, settings, pool, and consolation.</p>
        <TierEditor tiers={tiers} onChange={setTiers} prizes={prizes} />
      </div>
    </Modal>
  );
}

function EditTiersModal({ published, prizes, onClose, onSaved }: { published: PublishedMiniGameItem; prizes: StorePrize[]; onClose: () => void; onSaved: () => void }) {
  const [tiers, setTiers] = useState<MiniGameTierInput[]>(
    published.tiers.map((t) => ({ label: t.label, priceTokens: t.priceTokens, config: t.configJson, pool: t.poolJson, loseTokenValue: t.loseTokenValue, partialCreditEnabled: t.partialCreditEnabled, partialCreditPerStep: t.partialCreditPerStep })),
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api.updateMiniGameTiers(published.id, tiers);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
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
      <div className="flex flex-col gap-3">
        <TierEditor tiers={tiers} onChange={setTiers} prizes={prizes} />
      </div>
    </Modal>
  );
}
