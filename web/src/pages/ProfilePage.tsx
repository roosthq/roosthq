import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, COLOR_THEMES, ROLE_ICON, type Me, type Member, type LedgerEntry, type Redemption, type EarnedAward } from '../api';
import { AwardIcon } from './AwardsPage';
import { Avatar } from './CalendarPage';
import TokenBadge from '../TokenBadge';
import { useDialog } from '../Dialog';

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

export default function ProfilePage({
  me,
  tokenName,
  tokenIcon,
  chorePlural,
  onChangeColorTheme,
}: {
  me: Me;
  tokenName: string;
  tokenIcon: string;
  chorePlural: string;
  onChangeColorTheme: (id: string) => void;
}) {
  const { id } = useParams();
  const targetId = id ?? me.id;
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const isFamilyManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const viewingSelf = targetId === me.id;
  const { confirm } = useDialog();

  const [members, setMembers] = useState<Member[]>([]);
  const [allBalances, setAllBalances] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [awards, setAwards] = useState<EarnedAward[]>([]);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [b, l, r] = await Promise.all([
      api.tokenBalance(targetId),
      api.tokenLedger(targetId),
      api.redemptions({ userId: targetId }),
    ]);
    setBalance(b.balance);
    setLedger(l);
    setHistory(r);
    // Everyone (kids included) can browse all family profiles, same as adults.
    api.listUsers().then(setMembers).catch(() => setMembers([]));
    api.tokenBalances().then((bs) => setAllBalances(Object.fromEntries(bs.map((x) => [x.userId, x.balance])))).catch(() => undefined);
    // A kid can only ever see their own earned awards (server enforces this
    // too) — skip the call rather than surface a 403 when browsing a sibling.
    if (isAdult || viewingSelf) api.earnedAwards(targetId).then(setAwards).catch(() => setAwards([]));
    else setAwards([]);
  }, [targetId, isAdult, viewingSelf]);

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

  async function deleteEntry(l: LedgerEntry) {
    if (!(await confirm(`Delete "${l.reason}" (${l.delta >= 0 ? '+' : ''}${l.delta})? This can't be undone.`, { danger: true, confirmLabel: 'Delete' })))
      return;
    await api.deleteLedgerEntry(l.id);
    await refresh();
  }

  // Everyone manages their own PIN; adults additionally manage kids' PINs;
  // only the owner manages another adult's PIN.
  const canManagePin =
    viewingSelf || isFamilyManager || (isAdult && member?.role === 'KID');

  async function savePin() {
    try {
      await api.setUserPin(targetId, pin || null);
      setSettingPin(false);
      setPin('');
      setPinError(null);
      await refresh();
    } catch {
      setPinError('Could not save PIN — try again.');
    }
  }

  async function clearPin() {
    await api.setUserPin(targetId, null);
    await refresh();
  }

  return (
    <div>
      {members.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Profiles</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {members.map((m) => (
              <li key={m.id}>
                <Link
                  to={m.id === me.id ? '/profile' : `/profile/${m.id}`}
                  className="panel flex items-center gap-3 hover:bg-slate-50"
                  style={m.id === targetId ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}
                >
                  <Avatar name={m.displayName} src={m.avatar} />
                  <span>
                    <span className="block font-medium">{m.displayName}</span>
                    <span className="block text-xs text-slate-400">
                      {ROLE_ICON[m.role]} {m.role.toLowerCase()}
                    </span>
                  </span>
                  <span className="ml-2 text-lg font-bold" style={{ color: 'var(--accent)' }}>
                    {tokenIcon} {allBalances[m.id] ?? 0}
                    <span className="ml-1 text-xs font-normal text-slate-400">{tokenName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="text-xl font-bold">{name}</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${tokenName} balance`} value={`${tokenIcon} ${balance}`} />
        <Stat label={`${tokenName} earned`} value={`${tokenIcon} ${earned}`} />
        <Stat label={`${tokenName} spent`} value={`${tokenIcon} ${spent}`} />
        <Stat label={`${chorePlural} approved`} value={choresDone} />
      </div>

      {(isAdult || viewingSelf) && awards.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">🏆 Awards</h3>
          <ul className="mt-2 flex flex-wrap gap-3">
            {awards.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded border px-3 py-2" title={a.description ?? undefined}>
                <AwardIcon icon={a.icon} size="text-xl" />
                <span className="text-sm font-medium">{a.name}</span>
                {a.count > 1 && <span className="text-xs text-slate-400">×{a.count}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManagePin && (
        <section className="mt-6 rounded border p-3">
          <h3 className="text-sm font-semibold">PIN</h3>
          <p className="mt-1 text-xs text-slate-400">
            Used to unlock {viewingSelf ? 'your' : `${name}'s`} profile on a touch display.
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-slate-500">{member?.hasPin ? '🔒 PIN set' : 'No PIN set'}</span>
            <button
              onClick={() => {
                setSettingPin(true);
                setPin('');
                setPinError(null);
              }}
              className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
            >
              {member?.hasPin ? 'Change PIN' : 'Set PIN'}
            </button>
            {member?.hasPin && (
              <button onClick={clearPin} className="text-sm text-red-500 hover:text-red-700">
                Clear
              </button>
            )}
          </div>
        </section>
      )}

      {viewingSelf && (
        <section className="mt-6 rounded border p-3">
          <h3 className="text-sm font-semibold">My Theme</h3>
          <p className="mt-1 text-xs text-slate-400">Also changes what you see on the kiosk.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLOR_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => onChangeColorTheme(t.id)}
                title={t.label}
                aria-label={t.label}
                className="h-8 w-8 rounded-full border-2"
                style={{ background: t.swatch, borderColor: (me.colorTheme || 'meadow') === t.id ? 'var(--text)' : 'transparent' }}
              />
            ))}
          </div>
        </section>
      )}

      {isAdult && (
        <section className="mt-6 rounded border p-3">
          <h3 className="text-sm font-semibold">Adjust {tokenName}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
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
            <li key={l.id} className="flex items-center justify-between gap-2 border-b py-1">
              <span className="min-w-0 flex-1 break-words">
                {l.reason} <span className="text-xs text-slate-400">({l.type.toLowerCase()})</span>
                {l.createdByName && <span className="text-xs text-slate-400"> · by {l.createdByName}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={l.delta >= 0 ? 'font-medium text-green-600' : 'font-medium text-red-600'}>
                  {tokenIcon} {l.delta >= 0 ? '+' : ''}
                  {l.delta}
                </span>
                <span className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString()}</span>
                {isFamilyManager && (
                  <button onClick={() => deleteEntry(l)} className="text-xs text-red-500 hover:text-red-700">
                    Delete
                  </button>
                )}
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
            <li key={r.id} className="flex items-center justify-between gap-2 border-b py-1">
              <span className="min-w-0 flex-1 break-words">{r.prize.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                <TokenBadge icon={tokenIcon} amount={r.prize.tokenCost} />
                {new Date(r.requestedAt).toLocaleDateString()} · {r.status.toLowerCase()}
                {r.approvedByUser && ` by ${r.approvedByUser.displayName}`}
              </span>
            </li>
          ))}
          {history.length === 0 && <li className="text-slate-400">No purchases yet.</li>}
        </ul>
      </section>

      {settingPin && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center">
            <h3 className="text-lg font-semibold">PIN for {name}</h3>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePin()}
              placeholder="4+ digits"
              className="mt-3 w-full rounded border px-3 py-2 text-center text-2xl tracking-widest"
            />
            {pinError && <p className="mt-2 text-sm text-red-500">{pinError}</p>}
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setSettingPin(false)} className="rounded border px-4 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={savePin} className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
