import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { choreClient, type Chore, type Member, type Balance, type ChoreClient } from './api';

const REPEAT_OPTIONS: Array<{ value: string; label: string; help: string }> = [
  { value: '', label: 'One time', help: 'Happens once and is done.' },
  { value: 'DAILY', label: 'Every day', help: 'Repeats each day.' },
  { value: 'WEEKLY', label: 'Weekly', help: 'Repeats on the chosen day each week.' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks', help: 'Repeats on the chosen day every other week.' },
  { value: 'MONTHLY', label: 'Monthly', help: 'Repeats once a month.' },
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Actor = { id: string; role: string; displayName: string };

export default function ChoresPanel({
  me,
  client = choreClient(),
}: {
  me: Actor;
  client?: ChoreClient;
}) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const [c, b] = await Promise.all([client.chores(), client.balances()]);
    setChores(c);
    setBalances(b);
  }, [client]);

  useEffect(() => {
    refresh();
    if (isAdult) client.members().then(setMembers).catch(() => setMembers([]));
  }, [refresh, isAdult, client]);

  async function toggle(instanceId: string, checklistId: string, checked: boolean) {
    await client.checkItem(instanceId, checklistId, checked);
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
                      await client.completeInstance(active.id);
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
                        await client.approveInstance(active.id);
                        await refresh();
                      }}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500"
                    >
                      Approve
                    </button>
                    <button
                      onClick={async () => {
                        await client.rejectInstance(active.id);
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
          Balances:{' '}
          {balances
            .map((b) => `${members.find((m) => m.id === b.userId)?.displayName ?? 'member'}: ${b.balance}`)
            .join(' · ')}
        </div>
      )}

      {showCreate && (
        <CreateChore
          client={client}
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {help && <span className="ml-2 text-xs text-slate-400">{help}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CreateChore({
  client,
  members,
  onClose,
  onCreated,
}: {
  client: ChoreClient;
  members: Member[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeUserId, setAssignee] = useState(members[0]?.id ?? '');
  const [tokenValue, setTokenValue] = useState(0);
  const [repeat, setRepeat] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [checklist, setChecklist] = useState('');

  const needsDay = repeat === 'WEEKLY' || repeat === 'BIWEEKLY';
  const repeatHelp = REPEAT_OPTIONS.find((r) => r.value === repeat)?.help ?? '';

  async function submit() {
    if (!title || !assigneeUserId) return;
    await client.createChore({
      title,
      assigneeUserId,
      tokenValue: Number(tokenValue),
      recurrenceRule: repeat || undefined,
      dayOfWeek: needsDay && dayOfWeek != null ? dayOfWeek : undefined,
      checklist: checklist
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    onCreated();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">New chore</h3>
        <div className="mt-4 space-y-4">
          <Field label="Chore name">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="e.g. Take out the trash"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Who's it for?">
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
          </Field>

          <Field label="Reward" help="Tokens earned when an adult approves it.">
            <input
              type="number"
              min={0}
              className="w-28 rounded border px-3 py-2 text-sm"
              value={tokenValue}
              onChange={(e) => setTokenValue(Number(e.target.value))}
            />
          </Field>

          <Field label="Repeat" help={repeatHelp}>
            <select
              className="w-full rounded border px-3 py-2 text-sm"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            >
              {REPEAT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {needsDay && (
            <Field label="On which day?" help="The chore recurs on this weekday.">
              <div className="flex flex-wrap gap-1">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDayOfWeek(i)}
                    className={`rounded border px-3 py-1 text-sm ${
                      dayOfWeek === i ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Checklist" help="Optional — one sub-task per line. Kids tick these off.">
            <textarea
              className="h-24 w-full rounded border px-3 py-2 text-sm"
              placeholder={'e.g.\nGather trash from each room\nTake bins to the curb'}
              value={checklist}
              onChange={(e) => setChecklist(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={needsDay && dayOfWeek == null}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Create chore
          </button>
        </div>
      </div>
    </div>
  );
}
