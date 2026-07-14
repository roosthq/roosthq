import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { choreClient, pluralize, type Chore, type Member, type Balance, type ChoreClient } from './api';

// How many days ahead the 'today' sidebar looks for "coming up" items and
// anything open to claim early (claiming ahead is allowed server-side;
// completing isn't, until it's actually due).
const UPCOMING_DAYS = 3;

const REPEAT_OPTIONS: Array<{ value: string; label: string; help: string }> = [
  { value: '', label: 'One time', help: 'Happens once and is done.' },
  { value: 'DAILY', label: 'Every day', help: 'Can be done once each day.' },
  { value: 'WEEKLY', label: 'Weekly', help: 'Once a week on the chosen day.' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks', help: 'Every other week on the chosen day.' },
  { value: 'MONTHLY', label: 'Monthly', help: 'Once a month.' },
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Actor = { id: string; role: string; displayName: string };

export default function ChoresPanel({
  me,
  client: clientProp,
  variant = 'full',
}: {
  me: Actor;
  client?: ChoreClient;
  variant?: 'full' | 'today';
}) {
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const today = variant === 'today';
  // clientProp is a fresh object on every parent render when the caller doesn't
  // memoize it (e.g. Display.tsx); memoize here so `refresh` below stays stable
  // instead of re-firing its effect on every render.
  const client = useMemo(() => clientProp ?? choreClient(), [clientProp]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [tokenName, setTokenName] = useState('Tokens');
  const [tokenIcon, setTokenIcon] = useState('🪙');
  const [choreWord, setChoreWord] = useState('Chore');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Chore | null>(null);
  const chorePlural = pluralize(choreWord);

  const refresh = useCallback(async () => {
    const [c, b, m] = await Promise.all([client.chores(), client.balances(), client.members().catch(() => [])]);
    setChores(c);
    setBalances(b);
    setMembers(m);
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    client.familySettings().then((s) => {
      setTokenName(s.tokenName);
      setTokenIcon(s.tokenIcon);
      setChoreWord(s.choreWord);
    }).catch(() => undefined);
  }, [client]);

  const myBalance = balances.find((b) => b.userId === me.id)?.balance ?? 0;

  // Pick the actionable occurrence per chore: a pending one, else the earliest
  // one due now, else the soonest upcoming (so "Enable again" surfaces its new
  // one). In 'today' mode, keep: mine and due-or-coming-up-soon, anything open
  // to claim soon (claiming ahead is allowed server-side even though
  // completing isn't), or pending approval (mine, or — for adults — anyone's).
  const rows = chores
    .map((chore) => {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const endOfWindow = new Date(endOfToday);
      endOfWindow.setDate(endOfWindow.getDate() + UPCOMING_DAYS);

      const insts = chore.instances;
      const pending = insts.find((i) => i.status === 'PENDING');
      const dueOpen = insts
        .filter((i) => i.status === 'OPEN' && new Date(i.dueDate) <= endOfToday)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const upcoming = insts
        .filter((i) => i.status === 'OPEN')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const active = pending ?? dueOpen ?? upcoming ?? insts[0];
      const claimedBy = active?.claimedByUserId;
      const checked = new Set(active?.checks.map((c) => c.checklistId) ?? []);
      const mine = canAct(chore, claimedBy);
      const dueNow = active ? new Date(active.dueDate) <= endOfToday : false;
      const dueSoon = active ? new Date(active.dueDate) <= endOfWindow : false; // includes dueNow
      const openToClaim = chore.assignmentType === 'ANYONE' && !claimedBy && active?.status === 'OPEN' && dueSoon;
      const relevantToday =
        (mine && active?.status === 'OPEN' && dueSoon) ||
        openToClaim ||
        (active?.status === 'PENDING' && (mine || isAdult));
      return { chore, active, claimedBy, checked, mine, dueNow, openToClaim, relevantToday };
    })
    .filter((r) => !today || r.relevantToday);

  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'member';

  function assignmentLabel(chore: Chore, claimedBy?: string | null) {
    if (chore.assignmentType === 'ANYONE') {
      return claimedBy ? `Claimed by ${memberName(claimedBy)}` : 'Open to anyone';
    }
    return chore.assignees.map((a) => a.user.displayName).join(', ') || 'Unassigned';
  }

  function canAct(chore: Chore, claimedBy?: string | null) {
    if (chore.assignmentType === 'ANYONE') return claimedBy === me.id;
    return chore.assignees.some((a) => a.userId === me.id);
  }

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message || 'Something went wrong');
    }
    await refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className={today ? 'text-lg font-bold tracking-tight' : 'text-xl font-bold tracking-tight'}>
          {today ? 'Today' : chorePlural}
        </h2>
        {isAdult && !today && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            + New {choreWord}
          </button>
        )}
      </div>

      {today && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
          <span className="text-lg">{tokenIcon}</span>
          <span className="text-sm font-medium">
            {myBalance} {tokenName}
          </span>
        </div>
      )}

      <ul className={today ? 'mt-3 space-y-2' : 'mt-4 space-y-3'}>
        {rows.map(({ chore, active, claimedBy, checked, mine, dueNow, openToClaim }) => {
          return (
            <li key={chore.id} className={today ? 'rounded-lg border bg-white p-3 shadow-sm' : 'rounded-xl border bg-white p-4 shadow-sm'}>
              <div className="flex items-start justify-between">
                <div>
                  <span className={today ? 'text-sm font-semibold' : 'font-semibold'}>{chore.title}</span>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {assignmentLabel(chore, claimedBy)}
                    {chore.location ? ` · ${chore.location.name}` : ''}
                    {chore.recurrenceRule ? ` · ${chore.recurrenceRule.toLowerCase()}` : ''}
                    {chore.dayOfWeek != null ? ` · ${DOW[chore.dayOfWeek]}` : ''}
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600">
                  {chore.tokenValue} {tokenIcon}
                </span>
              </div>

              {chore.checklist.length > 0 && active && (
                <ul className="mt-2 space-y-1 pl-1">
                  {chore.checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked.has(item.id)}
                        disabled={!mine || active.status !== 'OPEN'}
                        onChange={(e) => act(() => client.checkItem(active.id, item.id, e.target.checked))}
                      />
                      <span className={checked.has(item.id) ? 'text-slate-400 line-through' : ''}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {active?.status === 'OPEN' && !dueNow && (
                  <span className="text-xs text-slate-400">
                    Next: {new Date(active.dueDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {active?.status === 'OPEN' && openToClaim && (
                  <button
                    onClick={() => act(() => client.claimInstance(active.id))}
                    className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    Claim this
                  </button>
                )}
                {active?.status === 'OPEN' && dueNow && mine && (
                  <button
                    onClick={() => act(() => client.completeInstance(active.id))}
                    className="rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                  >
                    Mark done
                  </button>
                )}
                {active?.status === 'OPEN' && dueNow && !mine && !openToClaim && (
                  <span className="text-xs text-slate-400">Not assigned to you</span>
                )}
                {active?.status === 'PENDING' && (
                  <span className="text-xs font-medium text-amber-600">Pending approval</span>
                )}
                {active?.status === 'PENDING' && isAdult && (
                  <>
                    <button
                      onClick={() => act(() => client.approveInstance(active.id))}
                      className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(() => client.rejectInstance(active.id))}
                      className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {active?.status === 'APPROVED' && <span className="text-xs text-green-600">Done ✓</span>}

                {isAdult && !today && (
                  <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
                    {active && claimedBy && (
                      <button onClick={() => act(() => client.assignInstance(active.id, null))} className="hover:text-slate-700">
                        Unassign
                      </button>
                    )}
                    <button onClick={() => act(() => client.reopenChore(chore.id))} className="hover:text-slate-700">
                      Enable again
                    </button>
                    <button
                      onClick={() => {
                        setEditing(chore);
                        setFormOpen(true);
                      }}
                      className="hover:text-slate-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => window.confirm(`Delete this ${choreWord.toLowerCase()}?`) && act(() => client.deleteChore(chore.id))}
                      className="text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-sm text-slate-400">{today ? 'Nothing to earn today' : `No ${chorePlural.toLowerCase()} yet.`}</li>
        )}
      </ul>

      {isAdult && !today && balances.length > 0 && (
        <div className="mt-4 text-sm text-slate-500">
          Balances: {balances.map((b) => `${memberName(b.userId)}: ${b.balance}`).join(' · ')}
        </div>
      )}

      {formOpen && (
        <ChoreForm
          client={client}
          members={members}
          chore={editing}
          choreWord={choreWord}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
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

function ChoreForm({
  client,
  members,
  chore,
  choreWord,
  onClose,
  onSaved,
}: {
  client: ChoreClient;
  members: Member[];
  chore: Chore | null;
  choreWord: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(chore?.title ?? '');
  const [assignmentType, setAssignmentType] = useState<'SPECIFIC' | 'ANYONE'>(chore?.assignmentType ?? 'SPECIFIC');
  const [assignees, setAssignees] = useState<Set<string>>(
    new Set(chore?.assignees.map((a) => a.userId) ?? []),
  );
  const [tokenValue, setTokenValue] = useState(chore?.tokenValue ?? 0);
  const [repeat, setRepeat] = useState(chore?.recurrenceRule ?? '');
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(chore?.dayOfWeek ?? null);
  const [checklist, setChecklist] = useState((chore?.checklist ?? []).map((c) => c.label).join('\n'));
  const [locationId, setLocationId] = useState(chore?.location?.id ?? '');
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    client.locations().then(setLocations).catch(() => undefined);
  }, [client]);

  const repeatHelp = REPEAT_OPTIONS.find((r) => r.value === repeat)?.help ?? '';

  async function submit() {
    if (!title) return;
    const body = {
      title,
      assignmentType,
      assigneeUserIds: assignmentType === 'SPECIFIC' ? [...assignees] : [],
      tokenValue: Number(tokenValue),
      recurrenceRule: repeat || undefined,
      dayOfWeek: dayOfWeek ?? undefined,
      checklist: checklist.split('\n').map((s) => s.trim()).filter(Boolean),
      locationId: locationId || null,
    };
    if (chore) await client.updateChore(chore.id, body);
    else await client.createChore(body);
    onSaved();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-auto rounded-xl bg-white p-5">
        <h3 className="text-lg font-bold">{chore ? `Edit ${choreWord}` : `New ${choreWord}`}</h3>
        <div className="mt-4 space-y-4">
          <Field label={`${choreWord} name`}>
            <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g. Take out the trash" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field label="Who does it?">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={assignmentType === 'SPECIFIC'} onChange={() => setAssignmentType('SPECIFIC')} />
                Specific people
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={assignmentType === 'ANYONE'} onChange={() => setAssignmentType('ANYONE')} />
                Open to anyone
              </label>
            </div>
            {assignmentType === 'SPECIFIC' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={assignees.has(m.id)}
                      onChange={(e) => {
                        const n = new Set(assignees);
                        if (e.target.checked) n.add(m.id);
                        else n.delete(m.id);
                        setAssignees(n);
                      }}
                    />
                    {m.displayName}
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="Location" help="Optional — for split households, who sees this depends on their location.">
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reward" help="Tokens for whoever completes it (after approval).">
            <input type="number" min={0} className="w-28 rounded-md border px-3 py-2 text-sm" value={tokenValue} onChange={(e) => setTokenValue(Number(e.target.value))} />
          </Field>

          <Field label="Repeat" help={repeatHelp}>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              {REPEAT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {(repeat === '' || repeat === 'WEEKLY' || repeat === 'BIWEEKLY') && (
            <Field label="Day of week" help="Optional — which day it happens (weekly/biweekly or a one-time).">
              <div className="flex flex-wrap gap-1">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDayOfWeek(dayOfWeek === i ? null : i)}
                    className={`rounded-md border px-3 py-1 text-sm ${dayOfWeek === i ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Checklist" help="Optional — one sub-task per line.">
            <textarea className="h-24 w-full rounded-md border px-3 py-2 text-sm" placeholder={'e.g.\nGather trash from each room\nTake bins to the curb'} value={checklist} onChange={(e) => setChecklist(e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            {chore ? 'Save changes' : `Create ${choreWord}`}
          </button>
        </div>
      </div>
    </div>
  );
}
