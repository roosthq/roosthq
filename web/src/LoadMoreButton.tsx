// Shared "Load more" row for every paginated history/ledger list -
// see usePaginatedList.ts.
export default function LoadMoreButton({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <button onClick={onClick} disabled={loading} className="mt-2 w-full rounded border py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
      {loading ? 'Loading…' : 'Load more'}
    </button>
  );
}
