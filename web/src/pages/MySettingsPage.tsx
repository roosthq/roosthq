import { useEffect, useState } from 'react';
import { api, loginUrl, COLOR_THEMES, type Me, type GoogleAccountInfo } from '../api';
import { setCelebrationSound } from '../celebrate';
import { Avatar } from './CalendarPage';
import ImageCropper, { cropImageToDataUri, type CropRect } from '../ImageCropper';
import { useDialog } from '../Dialog';
import CalendarsSettingsSection from '../CalendarsSettingsSection';
import {
  pushSupported,
  currentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../push';

// Everything about managing YOUR OWN account, in one place - separate from
// the basic Profile view (stats/awards/ledger, which anyone can browse for
// anyone) and from Settings (family/instance-wide config). Identity, PIN,
// password, avatar, color theme, connected Google accounts, notification
// prefs, and self-delete all live here, self-only - never reachable for
// anyone else's account, unlike Profile's :id route.
export default function MySettingsPage({
  me,
  onChangeColorTheme,
  onUpdateProfile,
  onLoggedOut,
}: {
  me: Me;
  onChangeColorTheme: (id: string) => void;
  onUpdateProfile: (patch: Partial<{ displayName: string; username: string | null; email: string | null; avatar: string | null }>) => Promise<void>;
  onLoggedOut: () => void;
}) {
  const { confirm, alert } = useDialog();
  const canDeleteSelf = me.role === 'ADULT' || me.role === 'FAMILY_MANAGER';
  const emailRequiredForMe = me.role !== 'KID';

  // Identity
  const [displayNameDraft, setDisplayNameDraft] = useState(me.displayName);
  const [usernameDraft, setUsernameDraft] = useState(me.username ?? '');
  const [emailDraft, setEmailDraft] = useState(me.email ?? '');
  const [identitySaved, setIdentitySaved] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  // Kids don't manage their own birthday (an adult does, in Family & PINs).
  const canEditBirthday = me.role !== 'KID';
  const [birthdayDraft, setBirthdayDraft] = useState(me.birthday ?? '');

  useEffect(() => {
    setDisplayNameDraft(me.displayName);
    setUsernameDraft(me.username ?? '');
    setEmailDraft(me.email ?? '');
  }, [me.displayName, me.username, me.email]);

  // Avatar + crop
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Google accounts
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountInfo[]>([]);
  useEffect(() => {
    api.listGoogleAccounts().then(setGoogleAccounts).catch(() => setGoogleAccounts([]));
  }, []);

  // Delete account
  const [deleteBusy, setDeleteBusy] = useState(false);

  // PIN - self only (managing a kid's/another adult's PIN stays in Settings
  // > Family members, which already covers that cross-person case).
  const [me2, setMe2] = useState<{ hasPin?: boolean } | null>(null);
  useEffect(() => {
    api.listUsers().then((list) => setMe2(list.find((m) => m.id === me.id) ?? null)).catch(() => undefined);
  }, [me.id]);
  const [settingPin, setSettingPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  async function savePin() {
    try {
      await api.setUserPin(me.id, pin || null);
      setSettingPin(false);
      setPin('');
      setPinError(null);
      setMe2((prev) => (prev ? { ...prev, hasPin: !!pin } : prev));
    } catch {
      setPinError('Could not save PIN - try again.');
    }
  }
  async function clearPin() {
    await api.setUserPin(me.id, null);
    setMe2((prev) => (prev ? { ...prev, hasPin: false } : prev));
  }

  // Notifications
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailOn, setEmailOn] = useState(!!me.notifyByEmail);
  useEffect(() => {
    currentPushSubscription().then((s) => setPushOn(!!s)).catch(() => undefined);
  }, []);
  // React Router does not scroll to #hash targets on its own, so a deep link
  // like /my-settings#notifications would land silently at the top.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(t);
  }, []);
  async function togglePush() {
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
      } else {
        await subscribeToPush();
        setPushOn(true);
      }
    } finally {
      setPushBusy(false);
    }
  }
  async function toggleEmail() {
    const next = !emailOn;
    setEmailOn(next);
    await api.setNotifyByEmail(next).catch(() => setEmailOn(!next));
  }

  // Celebration chime on complete/approve - applies immediately (no reload)
  // via setCelebrationSound, persisted per user on the server.
  const [soundOn, setSoundOn] = useState(me.soundEffects !== false);
  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setCelebrationSound(next);
    await api.setSoundEffects(next).catch(() => {
      setSoundOn(!next);
      setCelebrationSound(!next);
    });
  }

  async function saveIdentity() {
    setIdentityError(null);
    setIdentityBusy(true);
    try {
      await onUpdateProfile({
        displayName: displayNameDraft,
        username: usernameDraft.trim() || null,
        email: emailDraft.trim() || null,
      });
      if (canEditBirthday && (birthdayDraft || '') !== (me.birthday ?? '')) {
        await api.setOwnBirthday(birthdayDraft || null);
      }
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 1500);
    } catch (e) {
      setIdentityError((e as Error).message);
    } finally {
      setIdentityBusy(false);
    }
  }

  function onAvatarFile(file: File) {
    setAvatarError(null);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.onerror = () => setAvatarError('Could not read that image');
    reader.readAsDataURL(file);
  }

  async function onAvatarCropped(rect: CropRect) {
    if (!cropSrc) return;
    setAvatarBusy(true);
    try {
      const dataUri = await cropImageToDataUri(cropSrc, rect, 320, 0.85);
      await onUpdateProfile({ avatar: dataUri });
    } catch (e) {
      setAvatarError((e as Error).message);
    } finally {
      setAvatarBusy(false);
      setCropSrc(null);
    }
  }

  async function removeAvatar() {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await onUpdateProfile({ avatar: null });
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
      "Delete your account? This permanently removes your profile, token history, and purchase history - it can't be undone.",
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
    <div className="min-w-0 space-y-6">
      <h2 className="text-lg font-semibold">My Settings</h2>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">Photo &amp; identity</h3>
        <div className="mt-3 flex items-center gap-4">
          <div className="relative">
            <Avatar name={me.displayName} src={me.avatar} />
            <label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border bg-white text-xs shadow-sm hover:bg-slate-50">
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
            {avatarBusy ? 'Saving…' : 'Tap the camera to change your photo - you can pick which part shows.'}
            {me.avatar && !avatarBusy && (
              <button onClick={removeAvatar} className="ml-2 text-red-500 hover:text-red-700">
                Remove
              </button>
            )}
          </div>
        </div>
        {avatarError && <p className="mt-1 text-xs text-red-500">{avatarError}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              placeholder="Optional - for signing in without email"
              className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
            />
          </label>
          {canEditBirthday && (
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-500">Birthday</span>
              <input
                type="date"
                value={birthdayDraft}
                onChange={(e) => setBirthdayDraft(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
              />
              <span className="mt-1 block text-[11px] text-slate-400">Shows your age and adds a birthday countdown.</span>
            </label>
          )}
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs font-medium text-slate-500">Email{emailRequiredForMe ? '' : ' (optional)'}</span>
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
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">PIN</h3>
        <p className="mt-1 text-sm text-slate-500">Used to unlock your profile on a touch display.</p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-slate-500">{me2?.hasPin ? '🔒 PIN set' : 'No PIN set'}</span>
          <button
            onClick={() => {
              setSettingPin(true);
              setPin('');
              setPinError(null);
            }}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
          >
            {me2?.hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
          {me2?.hasPin && (
            <button onClick={clearPin} className="text-sm text-red-500 hover:text-red-700">
              Clear
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">Password</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {/* Only asked for when one's actually already set - nothing to
              confirm against on a Google-only account setting one for the
              first time, so don't show a field (or a message) for that case. */}
          {me.hasPassword && (
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="rounded border px-3 py-1.5 text-sm"
            />
          )}
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
        {passwordError && <p className="mt-1 text-xs text-red-500">{passwordError}</p>}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={savePassword}
            disabled={passwordBusy || !newPassword}
            className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {passwordBusy ? 'Saving…' : me.hasPassword ? 'Change password' : 'Set password'}
          </button>
          {passwordSaved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">My theme</h3>
        <p className="mt-1 text-sm text-slate-500">Also changes what you see on the kiosk.</p>
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

      <CalendarsSettingsSection isAdult={me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT'} />

      {/* id + scroll-margin: the Notifications page deep-links straight here
          (#notifications) because people could not find these controls. */}
      <section id="notifications" className="panel scroll-mt-20">
        <h3 className="text-base font-semibold tracking-tight">Notifications</h3>
        <div className="mt-3 space-y-2 text-sm">
          {pushSupported() && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={pushOn} disabled={pushBusy} onChange={togglePush} />
              Push notifications on this device
            </label>
          )}
          {me.email && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={emailOn} onChange={toggleEmail} />
              Also email me notifications
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={soundOn} onChange={toggleSound} />
            Celebration sound when completing tasks
          </label>
        </div>
      </section>

      <section className="panel">
        <h3 className="text-base font-semibold tracking-tight">Google accounts</h3>
        <ul className="mt-2 space-y-1.5">
          {googleAccounts.map((acct) => (
            <li key={acct.id} className="flex items-center gap-2 text-sm">
              {acct.picture ? (
                <img src={acct.picture} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="text-base">🔗</span>
              )}
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
        <a href={`${loginUrl}?mode=self`} className="mt-2 inline-block rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
          + Connect a Google account
        </a>
      </section>

      {canDeleteSelf && (
        <section className="panel">
          <h3 className="text-base font-semibold tracking-tight text-red-600">Delete account</h3>
          <p className="mt-1 text-sm text-slate-500">
            Permanently removes your profile, token history, and purchase history. This can't be undone.
          </p>
          <button
            onClick={deleteMyAccount}
            disabled={deleteBusy}
            className="mt-2 rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleteBusy ? 'Deleting…' : 'Delete my account'}
          </button>
        </section>
      )}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={1}
          title="Crop your photo"
          onCancel={() => setCropSrc(null)}
          onConfirm={onAvatarCropped}
        />
      )}

      {settingPin && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center">
            <h3 className="text-lg font-semibold">Your PIN</h3>
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
