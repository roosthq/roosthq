import { useState } from 'react';
import { api } from './api';
import PasswordInput from './PasswordInput';

const input = 'w-full rounded-lg border px-3 py-2 text-sm';

// The Google button stays the fast path; this is the "no Google account, or
// don't want to use it" alternative - a local username/email + password.
// Also handles the two side-quests that come with self-service passwords:
// "I forgot it" and the reset-link landing page.
export default function LocalAuthForm({
  inviteToken,
  resetToken,
  onLoggedIn,
}: {
  inviteToken?: string | null;
  resetToken?: string | null;
  onLoggedIn: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [open, setOpen] = useState(!!resetToken);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (resetToken) {
    return (
      <form
        className="mt-4 w-full max-w-xs space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) return setError("Passwords don't match");
          setBusy(true);
          try {
            await api.resetPassword(resetToken, password);
            setNotice('Password reset - you can sign in now.');
            window.history.replaceState(null, '', window.location.pathname);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm font-medium">Set a new password</p>
        <PasswordInput className={input} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordInput className={input} placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {notice && <p className="text-xs text-green-600">{notice}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Set password
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-sm text-slate-500 underline hover:text-slate-700">
        Or use a username/email and password
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email);
        setNotice("If that email is registered, we've sent a reset link.");
        return;
      }
      if (mode === 'register') {
        if (password !== confirm) return setError("Passwords don't match");
        await api.registerLocal({ displayName, email: email || undefined, username: username || undefined, password, inviteToken: inviteToken || undefined });
      } else {
        await api.loginLocal({ identifier, password });
      }
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 w-full max-w-xs space-y-2">
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => setMode('login')} className={mode === 'login' ? 'font-semibold' : 'text-slate-400'}>
          Log in
        </button>
        <button type="button" onClick={() => setMode('register')} className={mode === 'register' ? 'font-semibold' : 'text-slate-400'}>
          Create account
        </button>
      </div>

      {mode === 'register' && (
        <>
          <input className={input} placeholder="Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className={input} placeholder="Email (required for adults)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} placeholder="Username (optional if you have an email)" value={username} onChange={(e) => setUsername(e.target.value)} />
        </>
      )}

      {mode === 'login' && (
        <input className={input} placeholder="Email or username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
      )}

      {mode === 'forgot' ? (
        <input className={input} placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
      ) : (
        <>
          <PasswordInput className={input} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'register' && (
            <PasswordInput className={input} placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          )}
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {notice && <p className="text-xs text-green-600">{notice}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {mode === 'forgot' ? 'Send reset link' : mode === 'register' ? 'Create account' : 'Log in'}
      </button>

      {mode === 'login' && (
        <button type="button" onClick={() => { setMode('forgot'); setError(null); setNotice(null); }} className="text-xs text-slate-400 underline hover:text-slate-600">
          Forgot password?
        </button>
      )}
      {mode === 'forgot' && (
        <button type="button" onClick={() => { setMode('login'); setError(null); setNotice(null); }} className="text-xs text-slate-400 underline hover:text-slate-600">
          Back to log in
        </button>
      )}
    </form>
  );
}
