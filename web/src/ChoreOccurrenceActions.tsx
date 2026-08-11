import { useEffect, useState } from 'react';
import { choreClient, type Chore, type ChoreInstance } from './api';
import { celebrate } from './celebrate';
import ProofButton from './ProofButton';
import { useDialog } from './Dialog';
import TokenBadge from './TokenBadge';

// The full chore card (token value, checklist, actions) condensed for a
// single occurrence inside the calendar's day-detail modal - same info and
// same actions ChoresPanel offers, so "manage it from the calendar" really
// does mean the normal chore management, checklist included. A required
// checklist item blocks completion server-side, so without the checkboxes
// here there was no way to satisfy that from the calendar at all. A virtual
// (projected, not-yet-real) occurrence has nothing to act on - the server
// wouldn't let you complete a future-dated instance anyway.
export default function ChoreOccurrenceActions({
  chore,
  instance,
  me,
  onChanged,
  token,
}: {
  chore: Chore;
  instance: ChoreInstance | null;
  me: { id: string; role: string };
  onChanged: () => void;
  // Kiosk profile token - omit for the main (session-cookie) portal.
  token?: string;
}) {
  const { alert, confirm } = useDialog();
  const [busy, setBusy] = useState(false);
  const [tokenIcon, setTokenIcon] = useState('🪙');
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const client = choreClient(token);

  useEffect(() => {
    client.familySettings().then((s) => setTokenIcon(s.tokenIcon)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const tokenRow = <TokenBadge icon={tokenIcon} amount={chore.tokenValue} />;

  if (!instance) {
    return (
      <div className="mt-2 flex items-center gap-2">
        {tokenRow}
        <span className="text-xs text-slate-400">Upcoming</span>
      </div>
    );
  }

  const claimedBy = instance.claimedByUserId;
  const mine = chore.assignmentType === 'ANYONE' ? claimedBy === me.id : chore.assignees.some((a) => a.userId === me.id);
  const openToClaim = chore.assignmentType === 'ANYONE' && !claimedBy && instance.status === 'OPEN';
  // "Due today" (any time before midnight), not "due clock-time has passed" -
  // matches ChoresPanel's dueNow exactly, so the day modal and the sidebar
  // never disagree about whether an occurrence is actionable yet.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const dueNow = new Date(instance.dueDate).getTime() <= endOfToday.getTime();
  const checked = new Set(instance.checks.map((c) => c.checklistId));

  async function act(
    fn: () => Promise<unknown>,
    celebrateFrom?: HTMLElement,
    slot: string | ((result: unknown) => string) = 'notification',
  ) {
    setBusy(true);
    try {
      const result = await fn();
      if (celebrateFrom) celebrate(celebrateFrom, typeof slot === 'function' ? slot(result) : slot);
      onChanged();
    } catch (e) {
      await alert((e as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  // Approve response carries milestoneHit (see chores.service.ts) so the
  // approver's own tap plays the distinct streak-milestone sound instead of
  // the plain "chore approved" one when this approval also hit a streak goal.
  const approveSlot = (r: unknown) => ((r as { milestoneHit?: boolean } | undefined)?.milestoneHit ? 'streakMilestone' : 'choreApproved');

  const checklist = chore.checklist.length > 0 && (
    <ul className="mt-2 space-y-1">
      {chore.checklist.map((item) => (
        <li key={item.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked.has(item.id)}
            disabled={busy || !mine || instance.status !== 'OPEN'}
            onChange={(e) => act(() => client.checkItem(instance.id, item.id, e.target.checked))}
          />
          <span className={checked.has(item.id) ? 'text-slate-400 line-through' : ''}>{item.label}</span>
        </li>
      ))}
    </ul>
  );

  if (instance.status === 'APPROVED') {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2">
          {tokenRow}
          <span className="text-xs text-green-600">
            Done ✓{instance.approvedByUser && ` - approved by ${instance.approvedByUser.displayName}`}
          </span>
        </div>
      </div>
    );
  }
  if (instance.status === 'MISSED') {
    return (
      <div className="mt-2 flex items-center gap-2">
        {tokenRow}
        <span className="text-xs text-red-500">Missed</span>
      </div>
    );
  }
  if (instance.status === 'REJECTED') {
    return (
      <div className="mt-2 flex items-center gap-2">
        {tokenRow}
        <span className="text-xs text-red-500">Rejected - try again</span>
      </div>
    );
  }
  if (instance.status === 'SKIPPED') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tokenRow}
        <span className="text-xs text-slate-400">Skipped</span>
        {(mine || isAdult) && (
          <button
            disabled={busy}
            onClick={() => act(() => client.unskipInstance(instance.id))}
            className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            Undo skip
          </button>
        )}
      </div>
    );
  }

  if (instance.status === 'PENDING') {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          {tokenRow}
          <span className="text-xs font-medium text-amber-600">Pending approval</span>
        </div>
        {checklist}
        {isAdult && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={(e) => act(() => client.approveInstance(instance.id), e.currentTarget, approveSlot)}
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">{tokenRow}</div>
      {checklist}
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
        {dueNow && mine && chore.requireProof && (
          <ProofButton client={client} instanceId={instance.id} hasProof={!!instance.hasProof} onChanged={onChanged} />
        )}
        {dueNow && mine && (
          <button
            disabled={busy}
            onClick={(e) => act(() => client.completeInstance(instance.id), e.currentTarget, 'choreCompleted')}
            className="rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Mark done
          </button>
        )}
        {dueNow && mine && chore.allowSkip && (
          <button
            disabled={busy}
            onClick={async () => {
              const ok = await confirm(
                "Skip this for today? It counts as not doing it, so no reward is earned. It won't break a streak.",
                { confirmLabel: 'Yes, skip it' },
              );
              if (ok) await act(() => client.skipInstance(instance.id));
            }}
            className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            Skip
          </button>
        )}
        {dueNow && !mine && !openToClaim && <span className="text-xs text-slate-400">Not assigned to you</span>}
        {!dueNow && <span className="text-xs text-slate-400">Not due yet</span>}
      </div>
    </div>
  );
}
