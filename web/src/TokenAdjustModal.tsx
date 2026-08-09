import { useEffect, useState } from 'react';
import Modal from './Modal';
import { AwardIcon } from './pages/AwardsPage';
import type { AwardCatalogItem, Member, PrizeClient } from './api';

// Generic starting points shown alongside whatever this family has actually
// typed before (fetched via client.commonReasons()) - a mix of give/take so
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

const input = 'w-full rounded border px-3 py-2 text-sm';

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
  const [tab, setTab] = useState<'tokens' | 'award'>('tokens');

  // --- Tokens tab ---
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

  async function submitTokens() {
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

  // --- Award tab ---
  const [awards, setAwards] = useState<AwardCatalogItem[]>([]);
  const [awardId, setAwardId] = useState('');
  const [awardUserId, setAwardUserId] = useState(members[0]?.id ?? '');
  const [awardNote, setAwardNote] = useState('');
  const [awardTokenValue, setAwardTokenValue] = useState(0);

  useEffect(() => {
    if (tab !== 'award' || awards.length) return;
    client.awardsCatalog().then((list) => {
      setAwards(list);
      if (list[0]) {
        setAwardId(list[0].id);
        setAwardTokenValue(list[0].defaultTokenValue);
      }
    }).catch(() => undefined);
  }, [tab, awards.length, client]);

  const selectedAward = awards.find((a) => a.id === awardId);

  async function submitAward() {
    if (!awardId || !awardUserId) return;
    setSaving(true);
    try {
      await client.grantAward(awardId, {
        userId: awardUserId,
        note: awardNote.trim() || undefined,
        tokenValue: Math.max(0, Math.floor(Number(awardTokenValue) || 0)),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      header={
        <>
          <h3 className="text-lg font-semibold">Give / take {tokenName}</h3>
          <div className="mt-3 flex rounded border p-0.5 text-sm">
            <button
              onClick={() => setTab('tokens')}
              className={`flex-1 rounded px-3 py-1.5 ${tab === 'tokens' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
            >
              🪙 {tokenName}
            </button>
            <button
              onClick={() => setTab('award')}
              className={`flex-1 rounded px-3 py-1.5 ${tab === 'award' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
            >
              🏆 Award
            </button>
          </div>
        </>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          {tab === 'tokens' ? (
            <button
              onClick={submitTokens}
              disabled={saving || !userId || !reason.trim() || amount <= 0}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : sign === 'give' ? `Give ${amount}` : `Take ${amount}`}
            </button>
          ) : (
            <button
              onClick={submitAward}
              disabled={saving || !awardId || !awardUserId}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? 'Giving…' : 'Give award'}
            </button>
          )}
        </div>
      }
    >
      {tab === 'tokens' ? (
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
      ) : (
        <div className="space-y-3">
          <div>
            <span className="text-sm text-slate-500">Award</span>
            {awards.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">No awards in the catalog yet - add one from the header first.</p>
            ) : (
              <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {awards.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAwardId(a.id);
                      setAwardTokenValue(a.defaultTokenValue);
                    }}
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                      awardId === a.id ? 'border-slate-800 bg-slate-50' : ''
                    }`}
                  >
                    <AwardIcon icon={a.icon} size="text-lg" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-slate-500">To</span>
            <select className={`${input} mt-1`} value={awardUserId} onChange={(e) => setAwardUserId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-500">{tokenName}</span>
            <input
              type="number"
              min={0}
              className={`${input} mt-1`}
              value={awardTokenValue}
              onChange={(e) => setAwardTokenValue(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              onFocus={(e) => e.target.select()}
            />
            {selectedAward && (
              <span className="mt-1 block text-xs text-slate-400">
                Pre-filled from this award's default ({selectedAward.defaultTokenValue}) - adjustable.
              </span>
            )}
          </label>

          <input
            className={input}
            placeholder="Note (optional)"
            value={awardNote}
            onChange={(e) => setAwardNote(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
