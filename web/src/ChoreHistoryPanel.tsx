import { useMemo, useState } from 'react';
import { api } from './api';
import { formatDateTime } from './dateFormat';
import { usePaginatedList } from './usePaginatedList';
import LoadMoreButton from './LoadMoreButton';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  PENDING: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MISSED: 'Missed',
  SKIPPED: 'Skipped',
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'text-slate-500',
  PENDING: 'text-amber-600',
  APPROVED: 'text-green-600',
  REJECTED: 'text-red-500',
  MISSED: 'text-red-500',
  SKIPPED: 'text-slate-400',
};

// Adults-only (owner/family manager/adult; a kid never sees this) full
// activity log - every occurrence of every chore, not the main list's
// per-chore 5-row cap. For spot-checking that the schedule/approval/claim
// machinery is actually doing what it should, not day-to-day use, so it
// starts collapsed same as the Awards page's history.
export default function ChoreHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [choreFilter, setChoreFilter] = useState('');

  // Gated on `open` inside the fetcher itself (returning an empty page while
  // closed) rather than skipping the hook call - hooks can't be conditional,
  // and this still means nothing fetches until the panel's opened once.
  const page = usePaginatedList(
    (skip) => (open ? api.choreHistory(choreFilter || undefined, skip) : Promise.resolve({ items: [], hasMore: false })),
    [open, choreFilter],
  );
  const rows = page.items;

  const choreOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.choreId)) seen.set(r.choreId, r.choreTitle);
    return [...seen.entries()];
  }, [rows]);

  return (
    <section className="panel mt-6">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold hover:underline">
        {open ? '▾' : '▸'} Chore history
      </button>
      {open && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Chore</span>
            <select
              value={choreFilter}
              onChange={(e) => setChoreFilter(e.target.value)}
              className="rounded border px-2 py-1"
            >
              <option value="">All chores</option>
              {choreOptions.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            <span className="text-slate-400">
              {rows.length} occurrence{rows.length === 1 ? '' : 's'}
              {page.hasMore ? '+' : ''}
            </span>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="px-2 py-1.5">Chore</th>
                  <th className="px-2 py-1.5">Due</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Done by</th>
                  <th className="px-2 py-1.5">Approved by</th>
                  <th className="px-2 py-1.5">Completed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-medium">{r.choreTitle}</td>
                    <td className="px-2 py-1.5 text-slate-500">{formatDateTime(r.dueDate)}</td>
                    <td className={`px-2 py-1.5 font-medium ${STATUS_COLOR[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.claimedByName ?? '-'}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.approvedByUser?.displayName ?? '-'}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.completedAt ? formatDateTime(r.completedAt) : '-'}</td>
                  </tr>
                ))}
                {rows.length === 0 && !page.loading && (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-slate-400">
                      No history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <LoadMoreButton hasMore={page.hasMore} loading={page.loadingMore} onClick={page.loadMore} />
        </>
      )}
    </section>
  );
}
