import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  loginUrl,
  COLOR_THEMES,
  ROLE_ICON,
  ROLE_LABEL,
  type Me,
  type Member,
  type LedgerEntry,
  type Redemption,
  type EarnedAward,
  type GoogleAccountInfo,
} from '../api';
import { AwardIcon } from './AwardsPage';
import { Avatar } from './CalendarPage';
import { resizeImageFile } from '../Prize';
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
  onUpdateProfile,
  onLoggedOut,
}: {
  me: Me;
  tokenName: string;
  tokenIcon: string;
  chorePlural: string;
  onChangeColorTheme: (id: string) => void;
  onUpdateProfile: (patch: Partial<{ displayName: string; username: string | null; email: string | null; avatar: string | null }>) => Promise<void>;
  onLoggedOut: () => void;
}) {
  const { id } = useParams();
  const targetId = id ?? me.id;
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const isFamilyManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  // Adults and up manage their own account deletion, but not the instance
  // owner — deleting the one-of-a-kind OWNER account would strand every
  // instance-wide tool (Families, Holidays) with nobody able to use them.
  const canDeleteSelf = me.role === 'ADULT' || me.role === 'FAMILY_MANAGER';
  const viewingSelf = targetId === me.id;
  const { confirm, alert } = useDialog();

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

  // "Manage my profile" — viewingSelf only.
  const [displayNameDraft, setDisplayNameDraft] = useState(me.displayName);
  const [usernameDraft, setUsernameDraft] = useState(me.username ?? '');
  const [emailDraft, setEmailDraft] = useState(me.email ?? '');
  const [identitySaved, setIdentitySaved] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountInfo[]>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  // Keep the edit-form drafts in sync when `me` changes from outside this
  // component (onUpdateProfile's setMe in App.tsx) — otherwise a successful
  // save would leave stale text sitting in the still-focused-elsewhere inputs.
  useEffect(() => {
    setDisplayNameDraft(me.displayName);
    setUsernameDraft(me.username ?? '');
    setEmailDraft(me.email ?? '');
  }, [me.displayName, me.username, me.email]);

  useEffect(() => {
    if (!viewingSelf) return;
    api.listGoogleAccounts().then(setGoogleAccounts).catch(() => setGoogleAccounts([]));
  }, [viewingSelf]);

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

  const emailRequiredForMe = me.role !== 'KID';

  async function saveIdentity() {
    setIdentityError(null);
    setIdentityBusy(true);
    try {
      await onUpdateProfile({
        displayName: displayNameDraft,
        username: usernameDraft.trim() || null,
        email: emailDraft.trim() || null,
      });
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 1500);
      await refresh(); // the "Profiles" strip up top shows the old displayName until this refetches
    } catch (e) {
      setIdentityError((e as Error).message);
    } finally {
      setIdentityBusy(false);
    }
  }

  async function onAvatarFile(file: File) {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const dataUri = await resizeImageFile(file, 320, 0.8);
      await onUpdateProfile({ avatar: dataUri });
      await refresh();
    } catch (e) {
      setAvatarError((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await onUpdateProfile({ avatar: null });
      await refresh();
    } catch (e) {
      setAvatarError((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function savePassword() {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    setPasswordBusy(true);
    try {
      await api.setLocalPassword(me.id, newPassword, currentPassword || undefined);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 1500);
    } catch (e) {
      setPasswordError((e as Error).message);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function disconnectGoogle(acct: GoogleAccountInfo) {
    const label = acct.email ?? 'this Google account';
    if (
      !(await confirm(
        `Disconnect ${label}? Any calendars shared into the family from it disappear for everyone, immediately.`,
        { danger: true, confirmLabel: 'Disconnect' },
      ))
    )
      return;
    await api.disconnectGoogleAccount(acct.id);
    setGoogleAccounts((prev) => prev.filter((a) => a.id !== acct.id));
  }

  async function deleteMyAccount() {
    const ok = await confirm(
      "Delete your account? This permanently removes your profile, token history, and purchase history — it can't be undone.",
      { danger: true, confirmLabel: 'Delete my account' },
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      await api.deleteMyAccount();
      onLoggedOut();
    } catch (e) {
      await alert((e as Error).message || 'Could not delete your account.');
      setDeleteBusy(false);
    }
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
                      {ROLE_ICON[m.role]} {ROLE_LABEL[m.role] ?? m.role}
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
        <section className="mt-6 rounded border p-4">
          <h3 className="text-sm font-semibold">Manage my profile</h3>

          <div className="mt-3 flex items-center gap-4">
            <div className="relative">
              <Avatar name={me.displayName} src={me.avatar} />
              <label className="absolute -bottom-1 -right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border bg-white text-xs shadow-sm hover:bg-slate-50">
                📷
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={avatarBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAvatarFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="text-xs text-slate-400">
              {avatarBusy ? 'Uploading…' : 'Tap the camera to change your photo.'}
              {me.avatar && !avatarBusy && (
                <button onClick={removeAvatar} className="ml-2 text-red-500 hover:text-red-700">
                  Remove
                </button>
              )}
            </div>
          </div>
          {avatarError && <p className="mt-1 text-xs text-red-500">{avatarError}</p>}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-500">Display name</span>
              <input
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-500">Username</span>
              <input
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                placeholder="Optional — for signing in without email"
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">
                Email{emailRequiredForMe ? '' : ' (optional)'}
              </span>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                className="mt-1 w-full max-w-sm rounded border px-3 py-1.5 text-sm"
              />
            </label>
          </div>
          {identityError && <p className="mt-2 text-xs text-red-500">{identityError}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveIdentity}
              disabled={identityBusy || !displayNameDraft.trim()}
              className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {identityBusy ? 'Saving…' : 'Save'}
            </button>
            {identitySaved && <span className="text-sm text-green-600">Saved</span>}
          </div>

          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-semibold">Password</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="rounded border px-3 py-1.5 text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="rounded border px-3 py-1.5 text-sm"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="rounded border px-3 py-1.5 text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Leave "Current password" blank if you've never set one before (e.g. you've only ever signed in with Google).
            </p>
            {passwordError && <p className="mt-1 text-xs text-red-500">{passwordError}</p>}
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={savePassword}
                disabled={passwordBusy || !newPassword}
                className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {passwordBusy ? 'Saving…' : 'Change password'}
              </button>
              {passwordSaved && <span className="text-sm text-green-600">Saved</span>}
            </div>
          </div>

          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-semibold">My theme</h4>
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
          </div>

          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-semibold">Google accounts</h4>
            <ul className="mt-2 space-y-1.5">
              {googleAccounts.map((acct) => (
                <li key={acct.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{acct.email ?? 'Connected account'}</span>
                  {acct.needsReconnect && (
                    <a href={`${loginUrl}?mode=self&reconnect=1`} className="text-xs text-amber-600 hover:underline">
                      Needs reconnect
                    </a>
                  )}
                  <button onClick={() => disconnectGoogle(acct)} className="text-xs text-red-500 hover:text-red-700">
                    Disconnect
                  </button>
                </li>
              ))}
              {googleAccounts.length === 0 && <li className="text-sm text-slate-400">No Google account connected.</li>}
            </ul>
            <a href={`${loginUrl}?mode=self`} className="mt-2 inline-block rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + Connect a Google account
            </a>
          </div>

          {canDeleteSelf && (
            <div className="mt-6 border-t pt-4">
              <h4 className="text-sm font-semibold text-red-600">Delete account</h4>
              <p className="mt-1 text-xs text-slate-400">
                Permanently removes your profile, token history, and purchase history. This can't be undone.
              </p>
              <button
                onClick={deleteMyAccount}
                disabled={deleteBusy}
                className="mt-2 rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          )}
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
