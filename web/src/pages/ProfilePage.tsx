import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ROLE_ICON, ROLE_LABEL, type Me, type Member, type LedgerEntry, type Redemption, type EarnedAward } from '../api';
import { AwardIcon } from './AwardsPage';
import { Avatar } from './CalendarPage';
import TokenBadge from '../TokenBadge';
import { useDialog } from '../Dialog';
import { formatDate } from '../dateFormat';

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

// Tokens earned per day over the last 30 days as a small inline area chart —
// makes "am I doing better lately?" visible at a glance without a reports
// page. Pure SVG, no library.
function EarnedSparkline({ ledger, label }: { ledger: LedgerEntry[]; label: string }) {
  const days = 30;
  const byDay = new Array<number>(days).fill(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (const l of ledger) {
    if (l.delta <= 0) continue;
    const d = new Date(l.createdAt);
    d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - start.getTime()) / 86_400_000);
    if (idx >= 0 && idx < days) byDay[idx] += l.delta;
  }
  const max = Math.max(1, ...byDay);
  if (byDay.every((v) => v === 0)) return null;
  const W = 300;
  const H = 40;
  const step = W / (days - 1);
  const pts = byDay.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * (H - 4)).toFixed(1)}`);
  return (
    <div className="panel mt-3">
      <div className="mb-1 text-xs text-slate-500">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
        <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill="var(--accent)" opacity="0.15" />
        <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
    </div>
  );
}

// The basic, browse-anyone view — stats, awards, token/purchase history, and
// (adults) a quick manual token adjust. Deliberately kept simple: everything
// about managing YOUR OWN account (identity, password, avatar, PIN, Google
// accounts, delete) lives on My Settings instead — this page never mutates
// your own account, only ever someone's token ledger (an adult action, not
// a self-management one).
export default function ProfilePage({
  me,
  tokenName,
  tokenIcon,
  chorePlural,
}: {
  me: Me;
  tokenName: string;
  tokenIcon: string;
  chorePlural: string;
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
  const [streak, setStreak] = useState(0);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');

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
    // Longest active streak across this person's chores — the flame lives on
    // task cards already; the profile is where kids come to brag about it.
    api
      .chores()
      .then((cs) =>
        setStreak(
          Math.max(0, ...cs.filter((c) => c.assignees.some((a) => a.userId === targetId)).map((c) => c.currentStreak)),
        ),
      )
      .catch(() => setStreak(0));
  }, [targetId, isAdult, viewingSelf]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const member = members.find((m) => m.id === targetId);
  const tokensOff = !!member?.tokensDisabled;
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
                  className="panel panel-compact flex items-center gap-2 hover:bg-slate-50"
                  style={m.id === targetId ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}
                >
                  <Avatar name={m.displayName} src={m.avatar} size="sm" />
                  <span>
                    <span className="block text-sm font-medium">{m.displayName}</span>
                    <span className="block text-xs text-slate-400">
                      {ROLE_ICON[m.role]} {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </span>
                  {!m.tokensDisabled && (
                    <span className="ml-1 text-base font-bold" style={{ color: 'var(--accent)' }}>
                      {tokenIcon} {allBalances[m.id] ?? 0}
                      <span className="ml-1 text-xs font-normal text-slate-400">{tokenName}</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="text-xl font-bold">{name}</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {!tokensOff && (
          <>
            <Stat label={`${tokenName} balance`} value={`${tokenIcon} ${balance}`} />
            <Stat label={`${tokenName} earned`} value={`${tokenIcon} ${earned}`} />
            <Stat label={`${tokenName} spent`} value={`${tokenIcon} ${spent}`} />
          </>
        )}
        <Stat label={`${chorePlural} approved`} value={choresDone} />
        {streak > 0 && <Stat label="Best active streak" value={`🔥 ${streak}`} />}
      </div>

      {!tokensOff && <EarnedSparkline ledger={ledger} label={`${tokenName} earned, last 30 days`} />}

      {(isAdult || viewingSelf) && awards.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">🏆 Awards</h3>
          <ul className="mt-2 flex flex-wrap gap-3">
            {awards.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded border bg-white px-3 py-2" title={a.description ?? undefined}>
                <AwardIcon icon={a.icon} size="text-xl" />
                <span className="text-sm font-medium">{a.name}</span>
                {a.count > 1 && <span className="text-xs text-slate-400">×{a.count}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdult && !tokensOff && (
        <section className="mt-6 rounded border bg-white p-3">
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

      {!tokensOff && (
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
                  <span className="text-xs text-slate-400">{formatDate(l.createdAt)}</span>
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
      )}

      {!tokensOff && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Purchase history</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 border-b py-1">
                <span className="min-w-0 flex-1 break-words">{r.prize.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                  <TokenBadge icon={tokenIcon} amount={r.prize.tokenCost} />
                  {formatDate(r.requestedAt)} · {r.status.toLowerCase()}
                  {r.approvedByUser && ` by ${r.approvedByUser.displayName}`}
                </span>
              </li>
            ))}
            {history.length === 0 && <li className="text-slate-400">No purchases yet.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
