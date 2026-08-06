import { useEffect, useState } from 'react';
import Modal from './Modal';
import type { Member, PrizeClient } from './api';

// Generic starting points shown alongside whatever this family has actually
// typed before (fetched via client.commonReasons()) — a mix of give/take so
// there's always something to tap regardless of which way the adjustment
// goes. Deduped against the fetched list case-insensitively so a preset that
// matches real history doesn't show twice.
const DEFAULT_REASONS = [
  'Good behavior',
  'Extra chore done',
  'Helped a sibling',
  'Being kind',
  'Great day today',
  'Broke a rule',
  'Talked back',
  "Didn't listen",
  'Lost/damaged something',
];

export default function TokenAdjustModal({
  members,
  client,
  tokenName,
  onClose,
  onSaved,
}: {
  members: Member[];
  client: PrizeClient;
  tokenName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(members[0]?.id ?? '');
  const [sign, setSign] = useState<'give' | 'take'>('give');
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [commonReasons, setCommonReasons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.commonReasons().then(setCommonReasons).catch(() => undefined);
  }, [client]);

  const chips = [
    ...commonReasons,
    ...DEFAULT_REASONS.filter((d) => !commonReasons.some((c) => c.toLowerCase() === d.toLowerCase())),
  ];

  async function submit() {
    if (!userId || !reason.trim() || amount <= 0) return;
    setSaving(true);
    try {
      await client.adjustTokens({
        userId,
        delta: sign === 'give' ? amount : -amount,
        reason: reason.trim(),
        type: 'MANUAL',
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <Modal
      header={<h3 className="text-lg font-semibold">Give / take {tokenName}</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !userId || !reason.trim() || amount <= 0}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : sign === 'give' ? `Give ${amount}` : `Take ${amount}`}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-500">Who</span>
          <select className={`${input} mt-1`} value={userId} onChange={(e) => setUserId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <div className="flex-1">
            <span className="text-sm text-slate-500">Direction</span>
            <div className="mt-1 flex rounded border p-0.5 text-sm">
              <button
                onClick={() => setSign('give')}
                className={`flex-1 rounded px-2 py-1.5 ${sign === 'give' ? 'bg-green-600 text-white' : 'hover:bg-slate-50'}`}
              >
                + Give
              </button>
              <button
                onClick={() => setSign('take')}
                className={`flex-1 rounded px-2 py-1.5 ${sign === 'take' ? 'bg-red-500 text-white' : 'hover:bg-slate-50'}`}
              >
                − Take
              </button>
            </div>
          </div>
          <label className="w-28 text-sm">
            <span className="text-slate-500">{tokenName}</span>
            <input
              type="number"
              min={1}
              className={`${input} mt-1`}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>

        <div>
          <span className="text-sm text-slate-500">Reason</span>
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {chips.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full border px-2.5 py-1 text-xs hover:bg-slate-50 ${reason === r ? 'border-slate-800 bg-slate-800 text-white' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <input
            className={`${input} mt-2`}
            placeholder="Or type your own"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
