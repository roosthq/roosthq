import { useCallback, useEffect, useState } from 'react';
import { api, type Me, type Rule, type Member } from '../api';
import { useDialog } from '../Dialog';
import Modal from '../Modal';

export default function RulesPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const { confirm } = useDialog();
  const [rules, setRules] = useState<Rule[]>([]);
  const [kids, setKids] = useState<Member[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const refresh = useCallback(async () => {
    setRules(await api.rules());
    if (isAdult) {
      const members = await api.listUsers();
      setKids(members.filter((m) => m.role === 'KID'));
    }
  }, [isAdult]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function del(r: Rule) {
    if (!(await confirm('Delete this rule?', { danger: true, confirmLabel: 'Delete' }))) return;
    await api.deleteRule(r.id);
    await refresh();
  }

  const shared = rules.filter((r) => !r.targetUserId);
  const perKid = rules.filter((r) => r.targetUserId);

  function RuleRow({ r }: { r: Rule }) {
    return (
      <li className="flex items-start justify-between gap-3 rounded border bg-white p-3">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{r.text}</p>
        {isAdult && (
          <span className="flex shrink-0 gap-2 text-xs">
            <button
              onClick={() => {
                setEditing(r);
                setFormOpen(true);
              }}
              className="text-slate-500 hover:underline"
            >
              Edit
            </button>
            <button onClick={() => del(r)} className="text-red-500 hover:underline">
              Delete
            </button>
          </span>
        )}
      </li>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rules</h2>
        {isAdult && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            + Add rule
          </button>
        )}
      </div>

      <section className="mt-4">
        <h3 className="text-md font-semibold">Everyone</h3>
        <ul className="mt-2 space-y-2">
          {shared.map((r) => <RuleRow key={r.id} r={r} />)}
          {shared.length === 0 && <li className="text-sm text-slate-400">No shared rules yet.</li>}
        </ul>
      </section>

      {isAdult ? (
        kids.map((kid) => {
          const mine = perKid.filter((r) => r.targetUserId === kid.id);
          if (mine.length === 0) return null;
          return (
            <section key={kid.id} className="mt-8">
              <h3 className="text-md font-semibold">{kid.displayName}</h3>
              <ul className="mt-2 space-y-2">
                {mine.map((r) => <RuleRow key={r.id} r={r} />)}
              </ul>
            </section>
          );
        })
      ) : (
        perKid.length > 0 && (
          <section className="mt-8">
            <h3 className="text-md font-semibold">Just for you</h3>
            <ul className="mt-2 space-y-2">
              {perKid.map((r) => <RuleRow key={r.id} r={r} />)}
            </ul>
          </section>
        )
      )}

      {formOpen && (
        <RuleForm
          rule={editing}
          kids={kids}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function RuleForm({
  rule,
  kids,
  onClose,
  onSaved,
}: {
  rule: Rule | null;
  kids: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(rule?.text ?? '');
  const [targetUserId, setTargetUserId] = useState(rule?.targetUserId ?? '');

  async function submit() {
    if (!text.trim()) return;
    const body = { text: text.trim(), targetUserId: targetUserId || null };
    if (rule) await api.updateRule(rule.id, body);
    else await api.createRule(body);
    onSaved();
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <Modal
      header={<h3 className="text-lg font-semibold">{rule ? 'Edit rule' : 'Add rule'}</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {rule ? 'Save changes' : 'Add rule'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <textarea
          autoFocus
          className={`${input} h-28`}
          placeholder="e.g. No screens after 8pm on school nights"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="block text-sm">
          <span className="text-slate-500">Who's this for?</span>
          <select className={`${input} mt-1`} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
            <option value="">Everyone</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
