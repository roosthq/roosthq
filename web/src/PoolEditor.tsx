import { useState } from 'react';
import type { PoolEntry, StorePrize } from './api';
import { PrizeImage } from './Prize';
import TokenBadge from './TokenBadge';

// The weighted prize-pool builder - originally built for Award's #5 pool
// reward type, extracted here so mini-games (PLANNING.md §18) uses the
// exact same interface instead of a smaller reinvention of it. Any future
// improvement to this (a new row kind, a better prize picker) benefits
// both call sites at once instead of diverging.
//
// `prizes` is the FULL (non-archived) prize list, not pre-filtered to
// AWARD_ONLY - a pool entry picked before a prize's visibility later
// changed should still show its name/image here; the picker grid below
// filters to AWARD_ONLY on its own.
export default function PoolEditor({
  pool,
  onChange,
  prizes,
}: {
  pool: PoolEntry[];
  onChange: (pool: PoolEntry[]) => void;
  prizes: StorePrize[];
}) {
  // Which pool row's prize picker is currently expanded (only one at a time).
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);

  // Only prizes explicitly marked "Award only" are poolable - a regular
  // purchasable Store prize doesn't belong in a surprise pool (it's just
  // buyable directly, no game needed to find out).
  const poolablePrizes = prizes.filter((p) => p.visibility === 'AWARD_ONLY');

  function addTokenRow() {
    onChange([...pool, { kind: 'TOKENS', min: 1, max: 5, weight: 1 }]);
  }
  function addFreezeRow() {
    onChange([...pool, { kind: 'STREAK_FREEZE', min: 1, max: 2, weight: 1 }]);
  }
  function addPrizeRow() {
    onChange([...pool, { kind: 'PRIZE', prizeId: poolablePrizes[0]?.id ?? '', weight: 1 }]);
    setPickerOpenFor(pool.length); // open the picker on the row that's about to exist
  }
  function updateRow(i: number, patch: Partial<PoolEntry>) {
    onChange(pool.map((r, idx) => (idx === i ? ({ ...r, ...patch } as PoolEntry) : r)));
  }
  function removeRow(i: number) {
    onChange(pool.filter((_, idx) => idx !== i));
  }
  // Each row's real odds given the others' weights - shown so "weight 3 vs
  // weight 1" isn't just an abstract number to do math on.
  function poolPercent(i: number): number {
    const total = pool.reduce((s, r) => s + (r.weight ?? 1), 0);
    if (total <= 0) return 0;
    return Math.round(((pool[i]?.weight ?? 1) / total) * 100);
  }

  return (
    <div>
      <span className="text-xs font-medium text-slate-500">Prize pool - a mix of token ranges, streak-freeze ranges, and real prizes, each with a relative weight</span>
      <ul className="mt-1.5 space-y-2">
        {pool.map((row, i) => {
          const selectedPrize = row.kind === 'PRIZE' ? prizes.find((p) => p.id === row.prizeId) : undefined; // full `prizes` here, not poolablePrizes - a pool made before a prize got switched to STORE should still show its name
          return (
            <li key={i} className="card-nested rounded-lg p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  {row.kind === 'TOKENS' ? '🪙 Token range' : row.kind === 'STREAK_FREEZE' ? '🧊 Freeze range' : '🎁 Prize'}
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
                {row.kind === 'TOKENS' || row.kind === 'STREAK_FREEZE' ? (
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
                    <span className="text-xs text-slate-400">{row.kind === 'TOKENS' ? 'tokens' : 'freezes'}</span>
                  </span>
                ) : selectedPrize && pickerOpenFor !== i ? (
                  <button
                    type="button"
                    onClick={() => setPickerOpenFor(i)}
                    className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <PrizeImage src={selectedPrize.image} alt="" crop={selectedPrize.imageCrop} className="h-10 w-10 shrink-0 rounded" />
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{selectedPrize.name}</span>
                      <span className="block text-xs text-slate-400">
                        <TokenBadge icon="coins" amount={selectedPrize.tokenCost} /> · change
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
        <button type="button" onClick={addFreezeRow} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
          + 🧊 Freeze range
        </button>
        <button type="button" onClick={addPrizeRow} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
          + Prize
        </button>
      </div>
    </div>
  );
}
