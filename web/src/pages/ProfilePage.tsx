import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, familyFeatureEnabled, levelFor, ROLE_ICON, ROLE_SLOT, ROLE_LABEL, type FamilySettings, type Me, type Member, type LedgerEntry, type ActivityEntry, type EarnedAward, type FamilyLocation, type MyPresence } from '../api';
import PresenceModal from '../PresenceModal';
import { AwardIcon } from './AwardsPage';
import { Avatar } from './CalendarPage';
import LevelBadge from '../LevelBadge';
import Modal from '../Modal';
import { useDialog } from '../Dialog';
import { formatDate, formatDateTime } from '../dateFormat';
import { celebrate } from '../celebrate';
import LucideIcon from '../LucideIcon';
import { usePaginatedList } from '../usePaginatedList';
import LoadMoreButton from '../LoadMoreButton';

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="panel text-center">
      <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// A Stat tile's value slot is plain text sized by the tile itself (text-2xl
// font-bold) - an icon dropped in needs to match that, not TokenBadge's own
// small pill styling (which reads fine inline next to other content, but
// looks like a shrunken sticker sitting inside a big stat number).
function TokenStat({ icon, amount }: { icon: string; amount: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <LucideIcon name={icon} size={24} />
      {amount}
    </span>
  );
}

// Tokens earned per day over the last 30 days as a small inline area chart -
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

// The basic, browse-anyone view - stats, awards, token/purchase history, and
// (adults) a quick manual token adjust. Deliberately kept simple: everything
// about managing YOUR OWN account (identity, password, avatar, PIN, Google
// accounts, delete) lives on My Account instead - this page never mutates
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
  const [earnedBy, setEarnedBy] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [awards, setAwards] = useState<EarnedAward[]>([]);
  const [awardDetail, setAwardDetail] = useState<EarnedAward | null>(null);
  const [streak, setStreak] = useState(0);
  // Chore-earned bank only - the person-level bonus bank (manually granted,
  // awarded, or won) comes from `member.bonusStreakFreezes` instead, added
  // in below where the two are combined for display.
  const [choreFreezesBanked, setChoreFreezesBanked] = useState(0);
  const [given, setGiven] = useState<{ tokensGiven: number; awardsGiven: number; approvals: number; rejections: number } | null>(null);
  const [family, setFamily] = useState<FamilySettings | null>(null);
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [presenceModalOpen, setPresenceModalOpen] = useState(false);
  useEffect(() => {
    api.familySettings().then(setFamily).catch(() => undefined);
    api.locations().then(setLocations).catch(() => setLocations([]));
  }, []);

  // #4 - checked once whenever you're actually looking at your OWN profile
  // (never someone else's - an adult browsing a kid's profile shouldn't
  // spoil or steal their level-up moment). Idempotent server-side, so this
  // firing on every mount is fine.
  useEffect(() => {
    if (!viewingSelf) return;
    api
      .levelCheck()
      .then((r) => {
        if (r.leveledUp) setLevelUpTo(r.newLevel);
      })
      .catch(() => undefined);
  }, [viewingSelf]);
  useEffect(() => {
    if (levelUpTo !== null) celebrate(undefined, 'levelUp');
  }, [levelUpTo]);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');
  const [freezeDelta, setFreezeDelta] = useState(0);
  const [freezeReason, setFreezeReason] = useState('');

  // The merged "what happened" timeline (tokens, awards, purchases, streak
  // freezes) - a plain browsable list, nothing else on this page does math
  // over it, so it gets real pagination. `ledger` below is different:
  // earned/spent/choresDone/the sparkline all derive from that SAME array,
  // so paginating IT would make those totals visibly incomplete the moment
  // there's a "Load more" to click - it stays a single larger (take=200)
  // fetch instead, in the main refresh() below.
  const activityPage = usePaginatedList<ActivityEntry>((skip) => api.activity(targetId, skip), [targetId]);

  const refresh = useCallback(async () => {
    const [b, l] = await Promise.all([api.tokenBalance(targetId), api.tokenLedger(targetId, undefined, 0, 200)]);
    setBalance(b.balance);
    setLedger(l.items);
    // Everyone (kids included) can browse all family profiles, same as adults.
    api.listUsers().then(setMembers).catch(() => setMembers([]));
    // balances() (not tokenBalances()) so the roster/leaderboard below can
    // level-rank people, not just show their current balance.
    api.balances().then((bs) => {
      setAllBalances(Object.fromEntries(bs.map((x) => [x.userId, x.balance])));
      setEarnedBy(Object.fromEntries(bs.map((x) => [x.userId, x.earned ?? 0])));
    }).catch(() => undefined);
    // A kid can only ever see their own earned awards (server enforces this
    // too) - skip the call rather than surface a 403 when browsing a sibling.
    if (isAdult || viewingSelf) api.earnedAwards(targetId).then(setAwards).catch(() => setAwards([]));
    else setAwards([]);
    // Longest active streak across this person's chores - the flame lives on
    // task cards already; the profile is where kids come to brag about it.
    // Freezes banked (per-chore, max 3 each) summed across their chores too -
    // same "mine" filter, since a freeze belongs to the chore it protects,
    // not the person, but only their own assigned chores count as "theirs".
    api
      .chores()
      .then((cs) => {
        const mine = cs.filter((c) => c.assignees.some((a) => a.userId === targetId));
        setStreak(Math.max(0, ...mine.map((c) => c.currentStreak)));
        setChoreFreezesBanked(mine.reduce((sum, c) => sum + c.streakFreezes, 0));
      })
      .catch(() => {
        setStreak(0);
        setChoreFreezesBanked(0);
      });
    api.givenStats(targetId).then(setGiven).catch(() => setGiven(null));
  }, [targetId, isAdult, viewingSelf]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const member = members.find((m) => m.id === targetId);
  // Two independent reasons tokens can be off for what's rendered here: this
  // one PERSON has them disabled (a per-kid permission), or the whole family
  // does (the Tokens feature switch) - either one means hide every balance,
  // same as TokenBadge's own family-wide gate does for the components that
  // go through it. The raw {tokenIcon} spans below don't, so they need this
  // checked explicitly instead.
  const familyTokensOn = familyFeatureEnabled(family, 'tokens');
  const tokensOff = !!member?.tokensDisabled || !familyTokensOn;
  const name = viewingSelf ? me.displayName : member?.displayName ?? 'Member';
  const age = member?.birthday ? Math.floor((Date.now() - new Date(`${member.birthday}T00:00:00`).getTime()) / (365.25 * 86_400_000)) : null;
  const targetIsAdult = member ? member.role !== 'KID' : false;
  // Chore-earned bank + the person-level bonus bank (manually granted,
  // awarded, or won) - two separate numbers, shown as one total since
  // neither means anything to a kid on its own.
  const freezesBanked = choreFreezesBanked + (member?.bonusStreakFreezes ?? 0);
  const earned = ledger.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const spent = ledger.filter((l) => l.delta < 0).reduce((s, l) => s + Math.abs(l.delta), 0);
  const choresDone = ledger.filter((l) => l.type === 'CHORE').length;

  async function adjust(sign: 1 | -1) {
    if (!delta || !reason.trim()) return;
    await api.adjustTokens({ userId: targetId, delta: sign * Math.abs(delta), reason: reason.trim() });
    setDelta(0);
    setReason('');
    await refresh();
    await activityPage.reload();
  }

  async function adjustFreeze(sign: 1 | -1) {
    if (!freezeDelta || !freezeReason.trim()) return;
    await api.adjustStreakFreeze(targetId, sign * Math.abs(freezeDelta), freezeReason.trim());
    setFreezeDelta(0);
    setFreezeReason('');
    await refresh();
    await activityPage.reload();
  }

  // Only ever offered on a TOKEN_* row (see the "isFamilyManager &&" gate
  // below) - the real TokenLedger id is everything after the first ':' in
  // the merged row's own "token:<id>" key.
  async function deleteActivityEntry(a: ActivityEntry) {
    if (
      !(await confirm(`Delete "${a.label}" (${(a.amount ?? 0) >= 0 ? '+' : ''}${a.amount})? This can't be undone.`, {
        danger: true,
        confirmLabel: 'Delete',
      }))
    )
      return;
    await api.deleteLedgerEntry(a.id.slice(a.id.indexOf(':') + 1));
    await refresh();
    await activityPage.reload();
  }

  return (
    <div>
      {levelUpTo !== null && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <LucideIcon name="star" slot="badge.level" size={60} />
          <h2 className="text-3xl font-extrabold text-white">Level {levelUpTo}!</h2>
          <p className="max-w-xs text-center text-sm text-slate-300">
            {name} reached level {levelUpTo} - keep it up!
          </p>
          <button onClick={() => setLevelUpTo(null)} className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200">
            Nice!
          </button>
        </div>
      )}
      {members.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Profiles</h2>
          {/* Full-width rows on a phone, content-sized cards from sm up -
              wrapping content-sized cards at 375px split the level badge
              across lines. */}
          <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
            {members.map((m) => (
              <li key={m.id} className="min-w-0">
                <Link
                  to={m.id === me.id ? '/profile' : `/profile/${m.id}`}
                  className="panel panel-compact flex w-full items-center gap-2 hover:bg-slate-50 sm:w-auto"
                  style={m.id === targetId ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}
                >
                  <Avatar name={m.displayName} src={m.avatar} size="sm" />
                  <span className="min-w-0 flex-1">
                    {/* break-words, not truncate - a name sharing this row
                        with a token balance AND a level badge (both
                        shrink-0) had real names ("Jameson", "Freddy")
                        clipped to 3-4 letters at large text sizes, which is
                        worse than the row just getting a bit taller. */}
                    <span className="block break-words text-sm font-medium">{m.displayName}</span>
                    <span className="block break-words text-xs text-slate-400">
                      <LucideIcon name={ROLE_ICON[m.role]} slot={ROLE_SLOT[m.role]} size={12} /> {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </span>
                  {!m.tokensDisabled && familyTokensOn && (
                    <span className="ml-1 flex shrink-0 items-center gap-1 whitespace-nowrap text-base font-bold" style={{ color: 'var(--accent)' }}>
                      <LucideIcon name={tokenIcon} size={18} />
                      {allBalances[m.id] ?? 0}
                      <span className="ml-1 text-xs font-normal text-slate-400">{tokenName}</span>
                    </span>
                  )}
                  {!m.tokensDisabled && familyTokensOn && familyFeatureEnabled(family, 'levels') && (
                    <span className="shrink-0 whitespace-nowrap">
                      <LevelBadge earned={earnedBy[m.id] ?? 0} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {familyFeatureEnabled(family, 'leaderboard') && members.filter((m) => m.role === 'KID' && !m.tokensDisabled).length > 1 && (
        <div className="mb-4">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            <LucideIcon name="trophy" size={18} /> Leaderboard
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">Ranked by level, not just balance - so it isn't always whoever's oldest.</p>
          <ol className="mt-3 space-y-1.5">
            {members
              .filter((m) => m.role === 'KID' && !m.tokensDisabled)
              .map((m) => ({ m, level: levelFor(earnedBy[m.id] ?? 0), earned: earnedBy[m.id] ?? 0 }))
              .sort((a, b) => (b.level !== a.level ? b.level - a.level : b.earned - a.earned))
              .map(({ m }, i) => (
                <li key={m.id} className="card-nested flex items-center gap-3 rounded-lg px-3 py-2">
                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-slate-400">{i + 1}</span>
                  <Avatar name={m.displayName} src={m.avatar} size="sm" />
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{m.displayName}</span>
                  <LevelBadge earned={earnedBy[m.id] ?? 0} />
                </li>
              ))}
          </ol>
        </div>
      )}

      <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold">
        {name}
        {age !== null && <span className="text-sm font-normal text-slate-400">age {age}</span>}
        {member && (
          <button
            onClick={() => setPresenceModalOpen(true)}
            disabled={!viewingSelf && !(isAdult && member.role === 'KID')}
            title={viewingSelf || (isAdult && member.role === 'KID') ? "Change where they are" : undefined}
            className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-normal text-slate-500 enabled:hover:bg-slate-50"
          >
            <LucideIcon
              name={member.presenceStatus === 'AWAY' ? 'moon' : member.presenceStatus === 'VACATION' ? 'plane' : 'house'}
              slot={member.presenceStatus === 'AWAY' ? 'badge.presenceAway' : member.presenceStatus === 'VACATION' ? 'badge.presenceVacation' : 'badge.presenceHome'}
              size={12}
            />
            {member.presenceStatus === 'AWAY'
              ? 'Away'
              : member.presenceStatus === 'VACATION'
                ? 'Vacation'
                : locations.find((l) => l.id === member.presenceLocationId)?.name ?? 'Home'}
          </button>
        )}
      </h2>
      {presenceModalOpen && (
        <PresenceModalGate
          displayName={name}
          targetUserId={viewingSelf ? undefined : targetId}
          onClose={() => setPresenceModalOpen(false)}
          onSaved={() => {
            setPresenceModalOpen(false);
            refresh();
          }}
        />
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {!tokensOff && (
          <>
            <Stat label={`${tokenName} balance`} value={<TokenStat icon={tokenIcon} amount={balance} />} />
            <Stat label={`${tokenName} earned`} value={<TokenStat icon={tokenIcon} amount={earned} />} />
            <Stat label={`${tokenName} spent`} value={<TokenStat icon={tokenIcon} amount={spent} />} />
          </>
        )}
        <Stat label={`${chorePlural} approved`} value={choresDone} />
        {streak > 0 && (
          <Stat
            label="Best active streak"
            value={
              <span className="inline-flex items-center gap-1">
                <LucideIcon name="flame" slot="badge.streak" size={24} />
                {streak}
              </span>
            }
          />
        )}
        {familyFeatureEnabled(family, 'streakFreeze') && freezesBanked > 0 && (
          <Stat
            label={`Streak freeze${freezesBanked === 1 ? '' : 's'} banked`}
            value={
              <span className="inline-flex items-center gap-1">
                <LucideIcon name="snowflake" slot="badge.streakFreeze" size={24} />
                {freezesBanked}
              </span>
            }
          />
        )}
      </div>

      {/* Full-width, not a grid tile - matches KioskStatsModal's placement so
          the XP bar has room to actually read as a progress bar instead of
          being squeezed into one stat-tile's worth of width. */}
      {familyFeatureEnabled(family, 'levels') && !tokensOff && (
        <div className="mt-3">
          <LevelBadge earned={earned} size="lg" />
        </div>
      )}

      {!tokensOff && <EarnedSparkline ledger={ledger} label={`${tokenName} earned, last 30 days`} />}

      {targetIsAdult && given && (given.tokensGiven > 0 || given.awardsGiven > 0 || given.approvals > 0 || given.rejections > 0) && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Given out</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {!tokensOff && <Stat label={`${tokenName} given`} value={<TokenStat icon={tokenIcon} amount={given.tokensGiven} />} />}
            <Stat label="Awards given" value={given.awardsGiven} />
            <Stat label="Approvals" value={given.approvals} />
            <Stat label="Sent back" value={given.rejections} />
          </div>
        </section>
      )}

      {(isAdult || viewingSelf) && awards.length > 0 && (
        <section className="mt-6">
          <h3 className="flex items-center gap-1 text-sm font-semibold">
            <LucideIcon name="trophy" size={14} /> Awards
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">Tap one to see every time it's been given.</p>
          {/* Fixed size regardless of note count - a card that grows with
              however many notes it has read as chaotic once a few awards
              had several each. Notes/dates/who-gave-it live in the detail
              modal (see AwardHistoryModal) instead. */}
          <ul className="mt-2 flex flex-wrap gap-3">
            {awards.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setAwardDetail(a)}
                  className="card-nested flex w-40 items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  title={a.description ?? undefined}
                >
                  <AwardIcon icon={a.icon} size={20} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                  {a.count > 1 && <span className="shrink-0 text-xs text-slate-400">×{a.count}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {awardDetail && <AwardHistoryModal award={awardDetail} onClose={() => setAwardDetail(null)} />}

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

      {/* Silent give/take, same shape as Adjust {tokenName} above but for the
          person-level freeze bank (StreakFreezeService) - separate from
          whatever a chore's own milestone-earned bank is doing. */}
      {isAdult && familyFeatureEnabled(family, 'streakFreeze') && (
        <section className="mt-6 rounded border bg-white p-3">
          <h3 className="text-sm font-semibold">Adjust streak freezes</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              value={freezeDelta}
              onChange={(e) => setFreezeDelta(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              className="w-24 rounded border px-2 py-1 text-sm"
              placeholder="amount"
            />
            <input
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              className="flex-1 rounded border px-2 py-1 text-sm"
              placeholder="Reason (required)"
            />
            <button onClick={() => adjustFreeze(1)} className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-500">
              Give
            </button>
            <button onClick={() => adjustFreeze(-1)} className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">
              Take back
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            🧊 A wildcard that protects their next missed chore - independent of any freeze a chore's own streak has already banked.
          </p>
        </section>
      )}

      <section className="mt-6">
        <h3 className="text-sm font-semibold">History</h3>
        <p className="mt-0.5 text-xs text-slate-400">Everything that's happened - tokens, awards, purchases, and streak freezes, together.</p>
        <ul className="mt-2 space-y-1 text-sm">
          {activityPage.items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-b py-1.5">
              {/* Left column: what kind of thing this is. */}
              <span className="flex w-6 shrink-0 items-center justify-center">
                {a.kind === 'AWARD_BADGE' ? (
                  <AwardIcon icon={a.icon ?? null} size={18} />
                ) : a.kind === 'REDEMPTION' ? (
                  <LucideIcon name="shopping-bag" size={18} />
                ) : a.kind.startsWith('FREEZE_') ? (
                  <LucideIcon name="snowflake" slot="badge.streakFreeze" size={18} />
                ) : (
                  <LucideIcon name={tokenIcon} size={18} />
                )}
              </span>
              <span className="min-w-0 flex-1 break-words">
                {a.label}
                {a.createdByName && <span className="text-xs text-slate-400"> · by {a.createdByName}</span>}
                {a.detail && <span className="block text-xs text-slate-400">"{a.detail}"</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {a.amount !== undefined && (
                  <span className={`flex items-center gap-1 font-medium ${a.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {a.amountUnit === 'FREEZE' ? <LucideIcon name="snowflake" size={14} /> : <LucideIcon name={tokenIcon} size={14} />}
                    {a.amount >= 0 ? '+' : ''}
                    {a.amount}
                  </span>
                )}
                <span className="text-xs text-slate-400" title={formatDateTime(a.createdAt)}>
                  {formatDate(a.createdAt)}
                </span>
                {isFamilyManager && a.kind.startsWith('TOKEN_') && (
                  <button onClick={() => deleteActivityEntry(a)} className="btn-delete rounded px-2 py-0.5 text-xs">
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
          {activityPage.items.length === 0 && !activityPage.loading && <li className="text-slate-400">No activity yet.</li>}
        </ul>
        <LoadMoreButton hasMore={activityPage.hasMore} loading={activityPage.loadingMore} onClick={activityPage.loadMore} />
      </section>
    </div>
  );
}

// The badge card's click-through - icon/title/count/description up top (same
// facts the card itself shows, plus the description it only had room for in
// a hover title), then one row per time it's actually been given: date, who
// gave it, and the note if there was one. This is where notes/dates/granter
// live now - keeps the badge grid above a fixed size no matter how many.
function AwardHistoryModal({ award, onClose }: { award: EarnedAward; onClose: () => void }) {
  return (
    <Modal
      header={
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <AwardIcon icon={award.icon} size={24} />
          {award.name}
          <span className="text-sm font-normal text-slate-400">×{award.count}</span>
        </h3>
      }
      footer={
        <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
          Close
        </button>
      }
      onBackdropClick={onClose}
    >
      {award.description && <p className="text-sm text-slate-500">{award.description}</p>}
      <ul className="mt-3 space-y-2">
        {award.grants.map((g) => (
          <li key={g.id} className="rounded border p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span title={formatDateTime(g.createdAt)}>{formatDate(g.createdAt)}</span>
              <span>by {g.grantedByName}</span>
            </div>
            {g.note && <p className="mt-1">"{g.note}"</p>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// Preloads the RIGHT person's current status + households (theirs, not the
// viewer's) before handing off to PresenceModal - matters for the
// adult-setting-a-kid's-status case, where the viewer's own household list
// would otherwise show up in the picker instead of the kid's.
function PresenceModalGate({
  displayName,
  targetUserId,
  onSaved,
  onClose,
}: {
  displayName: string;
  targetUserId?: string; // undefined = viewing self
  onSaved: () => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<MyPresence | null>(null);
  useEffect(() => {
    (targetUserId ? api.presenceFor(targetUserId) : api.presenceMine()).then(setCurrent).catch(() => onClose());
  }, [targetUserId]);
  if (!current) return null;
  return (
    <PresenceModal
      displayName={displayName}
      current={current}
      targetUserId={targetUserId}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}
