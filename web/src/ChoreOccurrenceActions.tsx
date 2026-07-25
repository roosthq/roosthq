import { useState } from 'react';
import { choreClient, type Chore, type ChoreInstance } from './api';
import { useDialog } from './Dialog';

// Same claim/complete/approve/reject actions ChoresPanel offers, condensed
// for a single occurrence inside the calendar's day-detail modal. A virtual
// (projected, not-yet-real) occurrence has nothing to act on — the server
// wouldn't let you complete a future-dated instance anyway.
export default function ChoreOccurrenceActions({
  chore,
  instance,
  me,
  onChanged,
}: {
  chore: Chore;
  instance: ChoreInstance | null;
  me: { id: string; role: string };
  onChanged: () => void;
}) {
  const { alert } = useDialog();
  const [busy, setBusy] = useState(false);
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const client = choreClient();

  if (!instance) {
    return <div className="mt-1 text-xs text-slate-400">Upcoming</div>;
  }

  const claimedBy = instance.claimedByUserId;
  const mine = chore.assignmentType === 'ANYONE' ? claimedBy === me.id : chore.assignees.some((a) => a.userId === me.id);
  const openToClaim = chore.assignmentType === 'ANYONE' && !claimedBy && instance.status === 'OPEN';
  const dueNow = new Date(instance.dueDate).getTime() <= Date.now();

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      await alert((e as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (instance.status === 'APPROVED') {
    return (
      <div className="mt-1 text-xs text-green-600">
        Done ✓{instance.approvedByUser && ` — approved by ${instance.approvedByUser.displayName}`}
      </div>
    );
  }
  if (instance.status === 'MISSED') return <div className="mt-1 text-xs text-red-500">Missed</div>;
  if (instance.status === 'REJECTED') return <div className="mt-1 text-xs text-red-500">Rejected — try again</div>;

  if (instance.status === 'PENDING') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-amber-600">Pending approval</span>
        {isAdult && (
          <>
            <button
              disabled={busy}
              onClick={() => act(() => client.approveInstance(instance.id))}
              className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => client.rejectInstance(instance.id))}
              className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {openToClaim && (
        <button
          disabled={busy}
          onClick={() => act(() => client.claimInstance(instance.id))}
          className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          Claim this
        </button>
      )}
      {dueNow && mine && (
        <button
          disabled={busy}
          onClick={() => act(() => client.completeInstance(instance.id))}
          className="rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Mark done
        </button>
      )}
      {dueNow && !mine && !openToClaim && <span className="text-xs text-slate-400">Not assigned to you</span>}
      {!dueNow && <span className="text-xs text-slate-400">Not due yet</span>}
    </div>
  );
}
