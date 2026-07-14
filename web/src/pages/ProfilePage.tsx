import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Me, type Member, type LedgerEntry, type Redemption } from '../api';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel text-center">
      <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default function ProfilePage({ me, tokenName }: { me: Me; tokenName: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const targetId = id ?? me.id;
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  const viewingSelf = targetId === me.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');

  // Kids can only view their own profile.
  useEffect(() => {
    if (!isAdult && !viewingSelf) navigate('/profile', { replace: true });
  }, [isAdult, viewingSelf, navigate]);

  const refresh = useCallback(async () => {
    const [b, l, r] = await Promise.all([
      api.tokenBalance(targetId),
      api.tokenLedger(targetId),
      api.redemptions(targetId),
    ]);
    setBalance(b.balance);
    setLedger(l);
    setHistory(r);
    if (isAdult) api.listUsers().then(setMembers).catch(() => setMembers([]));
  }, [targetId, isAdult]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const member = members.find((m) => m.id === targetId);
  const name = viewingSelf ? me.displayName : member?.displayName ?? 'Member';
  const earned = ledger.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const spent = ledger.filter((l) => l.delta < 0).reduce((s, l) => s + Math.abs(l.delta), 0);
  const choresDone = ledger.filter((l) => l.type === 'CHORE').length;

  async function adjust(sign: 1 | -1) {
    if (!delta || !reason.trim()) return;
    await api.adjustTokens({ userId: targetId, delta: sign * Math.abs(delta), reason: reason.trim() });
    setDelta(0);
    setReason('');
    await refresh();
  }

  return (
    <div>
      {isAdult && members.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Profiles</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {members.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => navigate(m.id === me.id ? '/profile' : `/profile/${m.id}`)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    m.id === targetId ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  {m.displayName}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="text-xl font-bold">{name}</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${tokenName} balance`} value={balance} />
        <Stat label={`${tokenName} earned`} value={earned} />
        <Stat label={`${tokenName} spent`} value={spent} />
        <Stat label="Chores approved" value={choresDone} />
      </div>

      {isAdult && (
        <section className="mt-6 rounded border p-3">
          <h3 className="text-sm font-semibold">Adjust {tokenName}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              className="w-24 rounded border px-2 py-1 text-sm"
              placeholder="amount"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 rounded border px-2 py-1 text-sm"
              placeholder="Reason (required)"
            />
            <button onClick={() => adjust(1)} className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-500">
              Award
            </button>
            <button onClick={() => adjust(-1)} className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">
              Subtract
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Use for bonuses, penalties, or reconciling physical tokens.</p>
        </section>
      )}

      <section className="mt-6">
        <h3 className="text-sm font-semibold">{tokenName} history</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {ledger.map((l) => (
            <li key={l.id} className="flex items-center justify-between border-b py-1">
              <span>
                {l.reason} <span className="text-xs text-slate-400">({l.type.toLowerCase()})</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={l.delta >= 0 ? 'font-medium text-green-600' : 'font-medium text-red-600'}>
                  {l.delta >= 0 ? '+' : ''}
                  {l.delta}
                </span>
                <span className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString()}</span>
              </span>
            </li>
          ))}
          {ledger.length === 0 && <li className="text-slate-400">No activity yet.</li>}
        </ul>
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold">Purchase history</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {history.map((r) => (
            <li key={r.id} className="flex items-center justify-between border-b py-1">
              <span>{r.prize.name}</span>
              <span className="text-xs text-slate-400">
                {r.prize.tokenCost} {tokenName} · {new Date(r.requestedAt).toLocaleDateString()} · {r.status.toLowerCase()}
              </span>
            </li>
          ))}
          {history.length === 0 && <li className="text-slate-400">No purchases yet.</li>}
        </ul>
      </section>
    </div>
  );
}
