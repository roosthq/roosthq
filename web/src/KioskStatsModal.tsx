import { useEffect, useState } from 'react';
import { api, familyFeatureEnabled, type Chore, type EarnedAward, type FamilySettings, type LedgerEntry } from './api';
import Modal from './Modal';
import LevelBadge from './LevelBadge';
import { AwardIcon } from './pages/AwardsPage';
import { celebrate } from './celebrate';
import LucideIcon from './LucideIcon';
import type { ReactNode } from 'react';

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card-nested rounded-lg p-3 text-center">
      <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// Same reasoning as ProfilePage's own TokenStat - a Stat tile's value is
// sized by the tile (text-2xl font-bold), not TokenBadge's small pill.
function TokenStat({ icon, amount }: { icon: string; amount: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <LucideIcon name={icon} size={24} />
      {amount}
    </span>
  );
}

// The kiosk's answer to "what does my profile page show" - same numbers
// (balance, earned, level, best streak, awards with their notes), fetched
// through the kiosk-token-aware calls instead of the cookie-session ones
// the main app's ProfilePage uses, since the active kiosk profile has no
// cookie session at all. Deliberately lighter than ProfilePage (no 30-day
// sparkline, no purchase history) - this is "check your own stats without
// leaving the kiosk," not a full second copy of that page.
export default function KioskStatsModal({
  userId,
  displayName,
  tokenName,
  tokenIcon,
  chores,
  kioskToken,
  onClose,
}: {
  userId: string;
  displayName: string;
  tokenName: string;
  tokenIcon: string;
  chores: Chore[];
  kioskToken: string;
  onClose: () => void;
}) {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [awards, setAwards] = useState<EarnedAward[]>([]);
  const [family, setFamily] = useState<FamilySettings | null>(null);
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);

  useEffect(() => {
    api.tokenBalance(userId, kioskToken).then((b) => setBalance(b.balance)).catch(() => undefined);
    api.tokenLedger(userId, kioskToken).then(setLedger).catch(() => setLedger([]));
    api.earnedAwards(userId, kioskToken).then(setAwards).catch(() => setAwards([]));
    api.familySettings(kioskToken).then(setFamily).catch(() => undefined);
    // #4 - this modal is one of the three spots that count as "actually
    // looking at this person" (see users.service.ts levelCheck comment).
    api
      .levelCheck(kioskToken)
      .then((r) => {
        if (r.leveledUp) {
          setLevelUpTo(r.newLevel);
          celebrate(undefined, 'levelUp');
        }
      })
      .catch(() => undefined);
  }, [userId, kioskToken]);

  const earned = ledger.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const spent = ledger.filter((l) => l.delta < 0).reduce((s, l) => s + Math.abs(l.delta), 0);
  const bestStreak = Math.max(0, ...chores.filter((c) => c.assignees.some((a) => a.userId === userId)).map((c) => c.currentStreak), 0);

  return (
    <>
      {levelUpTo !== null && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <LucideIcon name="star" size={60} />
          <h2 className="text-3xl font-extrabold text-white">Level {levelUpTo}!</h2>
          <p className="max-w-xs text-center text-sm text-slate-300">
            {displayName} reached level {levelUpTo} - keep it up!
          </p>
          <button onClick={() => setLevelUpTo(null)} className="rounded-lg bg-white px-6 py-2.5 font-semibold text-slate-800 hover:bg-slate-200">
            Nice!
          </button>
        </div>
      )}
    <Modal
      header={<h3 className="text-2xl font-semibold">{displayName}'s stats</h3>}
      onBackdropClick={onClose}
      footer={
        <button onClick={onClose} className="rounded border px-4 py-2.5 text-base hover:bg-slate-50">
          Close
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {familyFeatureEnabled(family, 'tokens') && (
          <>
            <Stat label={`${tokenName} balance`} value={<TokenStat icon={tokenIcon} amount={balance} />} />
            <Stat label={`${tokenName} earned`} value={<TokenStat icon={tokenIcon} amount={earned} />} />
            <Stat label={`${tokenName} spent`} value={<TokenStat icon={tokenIcon} amount={spent} />} />
          </>
        )}
        <Stat
          label="Best active streak"
          value={
            <span className="inline-flex items-center gap-1">
              <LucideIcon name="flame" size={24} />
              {bestStreak}
            </span>
          }
        />
      </div>
      {family && familyFeatureEnabled(family, 'levels') && (
        <div className="mt-4">
          <LevelBadge earned={earned} size="lg" />
        </div>
      )}
      {awards.length > 0 && (
        <div className="mt-5">
          <h4 className="flex items-center gap-1 text-sm font-semibold">
            <LucideIcon name="trophy" size={14} /> Awards
          </h4>
          <ul className="mt-2 flex flex-wrap gap-3">
            {awards.map((a) => (
              <li key={a.id} className="card-nested max-w-xs rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <AwardIcon icon={a.icon} size={20} />
                  <span className="text-base font-medium">{a.name}</span>
                  {a.count > 1 && <span className="text-sm text-slate-400">×{a.count}</span>}
                </div>
                {a.notes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-1 text-sm text-slate-500">
                    {a.notes.map((note, i) => (
                      <li key={i} className="truncate" title={note}>
                        "{note}"
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
    </>
  );
}
