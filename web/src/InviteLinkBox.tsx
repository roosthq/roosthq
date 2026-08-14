import { useRef, useState } from 'react';
import { api } from './api';

// A freshly minted invite link, presented so it's actually usable on a phone:
// tapping the link selects the whole thing (a long token is impossible to
// hand-select), a Copy button for the normal case, and an email field so the
// server can deliver it instead of the adult juggling apps.
// Shared by Settings > Members and the instance-wide owner panel.
// The link itself: tap to select the whole token, or press Copy. Used on its
// own for kiosk links too, which need the same treatment minus the emailing.
export function CopyableLink({ url }: { url: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  function selectAll() {
    const el = codeRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  async function copy() {
    selectAll();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs a secure context and permission; the text is
      // already selected either way, so Ctrl/Cmd-C still works.
      setFailed(true);
    }
  }

  return (
    <>
      <code
        ref={codeRef}
        onClick={selectAll}
        className="block cursor-pointer break-all rounded border p-2 select-all"
        style={{ background: 'var(--surface)' }}
      >
        {url}
      </code>
      <button onClick={copy} className="mt-2 rounded border px-3 py-1.5 font-medium hover:bg-slate-50">
        {copied ? '✓ Copied' : '📋 Copy link'}
      </button>
      {failed && <p className="mt-1 text-red-600">Could not copy automatically - the link is selected, copy it manually.</p>}
    </>
  );
}

// `id` (not the raw token - only the token's hash is ever stored, so it
// can't be resent as-is) lets this box also offer "email this link" after
// the fact - e.g. the link-only path, or sending the same invite to a
// second address. sentTo pre-fills the success state when this invite was
// already emailed at creation (the primary flow now sends inline - see
// MembersManager.tsx), so this box doesn't lie and imply nothing was sent
// yet.
export default function InviteLinkBox({ url, id, sentTo: initialSentTo }: { url: string; id: string; sentTo?: string }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(initialSentTo ?? null);
  const [error, setError] = useState<string | null>(null);

  async function sendEmail() {
    setSending(true);
    setError(null);
    try {
      const r = await api.resendInvite(id, email.trim());
      setSent(r.sentTo ?? email.trim());
      setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that email.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="alert-banner mt-2 p-3 text-xs">
      <p className="mb-2 font-medium">Share this link, or send it by email. They open it, sign in, and join. One-time use.</p>
      <CopyableLink url={url} />
      {sent && <p className="mt-2 text-green-700">Invite sent to {sent}.</p>}
      {/* Stacked on a phone: an email field and a button side by side leaves
          neither one usable at 375px. */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={sent ? 'Send to a different address...' : 'Email address'}
          className="w-full min-w-0 rounded border px-2 py-2 text-xs"
        />
        <button
          onClick={sendEmail}
          disabled={sending || !email.trim()}
          className="w-full rounded bg-slate-800 px-3 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50 sm:w-auto"
        >
          {sending ? 'Sending…' : sent ? '✉️ Send again' : '✉️ Email invite'}
        </button>
      </div>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
