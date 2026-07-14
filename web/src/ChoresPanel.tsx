import { useCallback, useEffect, useState } from 'react';
import { api, type Chore, type Member, type Balance, type Me } from './api';

const RECURRENCE = ['', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'];

export default function ChoresPanel({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const [c, b] = await Promise.all([api.chores(), api.balances()]);
    setChores(c);
    setBalances(b);
  }, []);

  useEffect(() => {
    refresh();
    if (isAdult) api.members().then(setMembers).catch(() => setMembers([]));
  }, [refresh, isAdult]);

  const balanceFor = (userId: string) => balances.find((b) => b.userId === userId)?.balance ?? 0;

  async function toggle(instanceId: string, checklistId: string, checked: boolean) {
    await api.checkItem(instanceId, checklistId, checked);
    await refresh();
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chores</h2>
        {isAdult && (
          <button onClick={() => setShowCreate(true)} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            + New chore
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {chores.map((chore) => {
          const active = chore.instances[0];
          const checked = new Set(active?.checks.map((c) => c.checklistId) ?? []);
          return (
            <li key={chore.id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{chore.title}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {chore.assignee.displayName}
                    {chore.location ? ` · ${chore.location.name}` : ''}
                    {chore.recurrenceRule ? ` · ${chore.recurrenceRule.toLowerCase()}` : ''}
                  </span>
                </div>
                <span className="text-sm font-semibold text-amber-600">{chore.tokenValue} 🪙</span>
              </div>

              {chore.checklist.length > 0 && active && (
                <ul className="mt-2 space-y-1 pl-1">
                  {chore.checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked.has(item.id)}
                        disabled={active.status !== 'OPEN'}
                        onChange={(e) => toggle(active.id, item.id, e.target.checked)}
                      />
                      <span className={checked.has(item.id) ? 'text-slate-400 line-through' : ''}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex items-center gap-2">
                {active?.status === 'OPEN' && (
                  <button
                    onClick={async () => {
                      await api.completeInstance(active.id);
                      await refresh();
                    }}
                    className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                  >
                    Mark done
                  </button>
                )}
                {active?.status === 'PENDING' && (
                  <span className="text-xs font-medium text-amber-600">Pending approval</span>
                )}
                {active?.status === 'PENDING' && isAdult && (
                  <>
                    <button
                      onClick={async () => {
                        await api.approveInstance(active.id);
                        await refresh();
                      }}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500"
                    >
                      Approve
                    </button>
                    <button
                      onClick={async () => {
                        await api.rejectInstance(active.id);
                        await refresh();
                      }}
                      className="rounded border px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {chores.length === 0 && <li className="text-sm text-slate-400">No chores yet.</li>}
      </ul>

      {isAdult && balances.length > 0 && (
        <div className="mt-4 text-sm text-slate-500">
          Balances: {balances.map((b) => `${members.find((m) => m.id === b.userId)?.displayName ?? 'member'}: ${b.balance}`).join(' · ')}
        </div>
      )}

      {showCreate && (
        <CreateChore
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      {/* balanceFor is exposed for future per-kid views */}
      <span className="hidden">{balanceFor(me.id)}</span>
    </section>
  );
}

function CreateChore({
  members,
  onClose,
  onCreated,
}: {
  members: Member[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeUserId, setAssignee] = useState(members[0]?.id ?? '');
  const [tokenValue, setTokenValue] = useState(0);
  const [recurrenceRule, setRecurrence] = useState('');
  const [checklist, setChecklist] = useState('');

  async function submit() {
    if (!title || !assigneeUserId) return;
    await api.createChore({
      title,
      assigneeUserId,
      tokenValue: Number(tokenValue),
      recurrenceRule: recurrenceRule || undefined,
      checklist: checklist
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    onCreated();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <h3 className="text-lg font-semibold">New chore</h3>
        <div className="mt-3 space-y-3">
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={assigneeUserId}
            onChange={(e) => setAssignee(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <input
              type="number"
              className="w-28 rounded border px-3 py-2 text-sm"
              placeholder="Tokens"
              value={tokenValue}
              onChange={(e) => setTokenValue(Number(e.target.value))}
            />
            <select
              className="flex-1 rounded border px-3 py-2 text-sm"
              value={recurrenceRule}
              onChange={(e) => setRecurrence(e.target.value)}
            >
              {RECURRENCE.map((r) => (
                <option key={r} value={r}>
                  {r === '' ? 'Single' : r.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="h-24 w-full rounded border px-3 py-2 text-sm"
            placeholder="Checklist (one item per line, optional)"
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
