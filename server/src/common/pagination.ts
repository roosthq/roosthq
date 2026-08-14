// Shared "fetch one more than you need" pagination helper - every history/
// ledger-style list in this app (audit log, token ledger, notifications,
// redemptions, award grants, chore history) used to hard-cap at ~200-300
// rows with no way to see anything older (a real, previously-intentional
// tradeoff - see the old comment this replaces in chores.service.ts). This
// gives real pagination instead: query for `take + 1` rows, and if you got
// the extra one back, there's a next page - no separate COUNT query needed.
export const PAGE_SIZE = 50;

export function paginate<T>(rows: T[], take: number): { items: T[]; hasMore: boolean } {
  const hasMore = rows.length > take;
  return { items: hasMore ? rows.slice(0, take) : rows, hasMore };
}

// Clamped, safe-to-trust-from-a-query-string skip/take pair.
export function parsePageParams(skip?: string, take?: string): { skip: number; take: number } {
  const s = Math.max(0, parseInt(skip ?? '0', 10) || 0);
  const t = Math.min(200, Math.max(1, parseInt(take ?? '', 10) || PAGE_SIZE));
  return { skip: s, take: t };
}
