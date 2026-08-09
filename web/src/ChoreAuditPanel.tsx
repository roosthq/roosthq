import { useEffect, useState } from 'react';
import { api, type Chore, type ChoreAuditEntry } from './api';
import { formatDateTime } from './dateFormat';

const ACTION_LABEL: Record<string, string> = {
  'chore.create': 'Created',
  'chore.update': 'Edited',
  'chore.delete': 'Deleted',
};

const ACTION_COLOR: Record<string, string> = {
  'chore.create': 'text-green-600',
  'chore.update': 'text-amber-600',
  'chore.delete': 'text-red-500',
};

// Owner/family-manager only - who created, edited, or deleted a chore, and
// exactly what settings changed. Separate from ChoreHistoryPanel, which is
// visible to any adult and tracks occurrence activity (completed/approved),
// not a record of who touched the chore's own settings. Per-chore only (no
// "all chores" merged view) since the server route is /chores/:id/audit.
export default function ChoreAuditPanel() {
  const [open, setOpen] = useState(false);
  const [chores, setChores] = useState<Chore[]>([]);
  const [choreId, setChoreId] = useState('');
  const [rows, setRows] = useState<ChoreAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && chores.length === 0) {
      api.chores().then(setChores).catch(() => setChores([]));
    }
  }

  useEffect(() => {
    if (!choreId) {
      setRows([]);
      return;
    }
    setLoading(true);
    api
      .choreAudit(choreId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [choreId]);

  return (
    <section className="panel mt-6">
      <button onClick={toggle} className="text-sm font-semibold hover:underline">
        {open ? '▾' : '▸'} Chore change log
      </button>
      {open && (
        <>
          <p className="mt-1 text-xs text-slate-400">Who created, edited, or deleted a chore, and what changed. Only you can see this.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Chore</span>
            <select value={choreId} onChange={(e) => setChoreId(e.target.value)} className="rounded border px-2 py-1">
              <option value="">Pick a chore...</option>
              {chores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {choreId && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="px-2 py-1.5">When</th>
                    <th className="px-2 py-1.5">Action</th>
                    <th className="px-2 py-1.5">By</th>
                    <th className="px-2 py-1.5">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 text-slate-500">{formatDateTime(r.createdAt)}</td>
                      <td className={`px-2 py-1.5 font-medium ${ACTION_COLOR[r.action] ?? ''}`}>{ACTION_LABEL[r.action] ?? r.action}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.actorName}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.detail ?? ''}</td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-slate-400">
                        No changes recorded for this chore yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
