import { useEffect, useState } from 'react';

// "Add to Home Screen" nudge for phones and tablets. The web app already is a
// PWA (manifest + service worker); this just tells people how to install it,
// because iPhone never offers it by itself and push notifications on iPhone
// only work from the installed copy. Android Chrome gets a real Install button.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SNOOZE_KEY = 'rhq_install_nudge_until';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallNudge() {
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    // Phones/tablets only, never the wall kiosk, never once it's installed.
    const isKiosk = new URLSearchParams(window.location.search).has('display');
    const touchDevice = navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 1100px)').matches;
    if (isKiosk || !touchDevice || isStandalone() || snoozed()) return;
    setShow(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* storage blocked: it just comes back next visit */
    }
    setShow(false);
  }

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm" role="note">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Install Roost HQ on this device</p>
        <p className="text-slate-500">
          {isIos()
            ? 'Tap the Share button, then "Add to Home Screen". On iPhone, notifications only work from the Home Screen app.'
            : prompt
              ? 'It opens like a normal app, with its own icon and notifications.'
              : 'Open your browser menu and choose "Install app" or "Add to Home screen".'}
        </p>
      </div>
      {prompt && (
        <button
          onClick={async () => {
            await prompt.prompt();
            const choice = await prompt.userChoice.catch(() => null);
            setPrompt(null);
            if (choice?.outcome === 'accepted') setShow(false);
          }}
          className="rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} className="rounded border px-3 py-1.5 text-slate-600 hover:bg-slate-50">
        Not now
      </button>
    </div>
  );
}
