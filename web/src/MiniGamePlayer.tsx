import { useState } from 'react';
import { api, type MiniGamePlaySession } from './api';
import MiniGamePinTumbler, { MiniGamePinTumblerPreview, type MiniGamePlayReport } from './MiniGamePinTumbler';

// Which idle-preview component (if any) a game type has been ported with -
// same dispatch shape as the `playing` phase below, so a future port (Wire
// Splice is next per PLANNING.md §18) adds one line in both places.
function previewFor(gameType: string) {
  if (gameType === 'PIN_TUMBLER') return MiniGamePinTumblerPreview;
  return null;
}

// Plays out ONE session (a MiniGameGrant or a MiniGamePurchase - identical
// shape past this point, PLANNING.md §18): shows the pre-drawn "you're
// playing for ___" screen, commits on Start, mounts the actual game, then
// reports the outcome. Reused for kid mobile, kid kiosk, and (unchanged)
// for either distribution path - only `kind`/`session`/the completion
// endpoints differ.
export default function MiniGamePlayer({
  session,
  kind,
  kioskToken,
  onDone,
}: {
  session: MiniGamePlaySession;
  kind: 'grant' | 'purchase';
  kioskToken?: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'preview' | 'playing' | 'result'>(session.status === 'IN_PROGRESS' ? 'playing' : 'preview');
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.playMiniGame>> | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      await api.startMiniGamePlay(kind, session.id, kioskToken);
      setPhase('playing');
    } finally {
      setStarting(false);
    }
  }

  async function handleFinish(report: MiniGamePlayReport) {
    const res = await api.playMiniGame(kind, session.id, report, kioskToken);
    setResult(res);
    setPhase('result');
  }

  function prizeLine() {
    const d = session.drawnResult;
    if (d.kind === 'TOKENS') return `${d.amount} tokens`;
    if (d.kind === 'STREAK_FREEZE') return `${d.amount} streak freeze${d.amount === 1 ? '' : 's'}`;
    return 'a prize';
  }

  if (phase === 'preview') {
    const Preview = previewFor(session.game.gameType);
    return (
      <div className="panel flex flex-col items-center gap-3 p-5 text-center">
        {Preview ? (
          <div className="w-full max-w-sm overflow-hidden rounded-xl">
            <Preview />
          </div>
        ) : (
          <div className="text-3xl">{session.game.icon || '🎮'}</div>
        )}
        <h3 className="text-lg font-semibold">{session.game.name}</h3>
        <p className="text-sm text-slate-500">
          Playing for <span className="font-semibold text-slate-800">{prizeLine()}</span> if you win.
        </p>
        <button
          onClick={start}
          disabled={starting}
          className="mt-2 rounded-lg bg-amber-500 px-5 py-2 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
        <p className="text-xs text-slate-400">Once you press Start, closing out or refreshing counts as a loss - no consolation.</p>
      </div>
    );
  }

  if (phase === 'playing') {
    // Only PIN_TUMBLER is wired to a real component so far (PLANNING.md §18
    // build order - Lock Pick first, the other nine port later).
    if (session.game.gameType === 'PIN_TUMBLER') {
      return <MiniGamePinTumbler config={session.config} onFinish={handleFinish} />;
    }
    return <p className="p-4 text-center text-sm text-slate-500">This game type isn't playable yet.</p>;
  }

  if (!result) return null;
  return (
    <div className="panel flex flex-col items-center gap-2 p-5 text-center">
      <div className="text-2xl font-bold" style={{ color: result.won ? '#16a34a' : '#dc2626' }}>
        {result.won ? 'You won!' : 'No luck this time'}
      </div>
      {result.tokensAwarded > 0 && <p className="text-sm text-slate-600">+{result.tokensAwarded} tokens</p>}
      {result.prizeWonId && <p className="text-sm text-slate-600">A prize is waiting for you - ask an adult!</p>}
      {!result.won && result.tokensAwarded === 0 && <p className="text-sm text-slate-500">Nothing this time.</p>}
      <button onClick={onDone} className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
        Done
      </button>
    </div>
  );
}
