// Completion celebration: a confetti burst (DOM + CSS, no dependencies) and
// a synthesized chime (WebAudio, no audio assets). Sound is on by default on
// every surface — phones/tablets/desktop included — since the chime only ever
// fires from a user's own tap (which also satisfies autoplay policies). The
// kiosk overrides it from its DisplayConfig soundEffects toggle.

const COLORS = ['#4e7a4c', '#d4c06a', '#6eaa6c', '#d4ead0', '#e07c5c', '#5baedd', '#b58ae0'];

let soundEnabled = true;
export function setCelebrationSound(on: boolean) {
  soundEnabled = on;
}

let audioCtx: AudioContext | null = null;
function chime() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    // Two quick rising notes — reads as "coin collected", short enough to
    // never get old on a kiosk that hears it many times a day.
    for (const [i, freq] of [987.77, 1318.51].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = t0 + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    }
  } catch {
    // No AudioContext (old browser, blocked autoplay) — celebration is
    // visual-only, never an error.
  }
}

// Burst confetti from the center of `from` (usually the tapped button), or
// screen-center when no element is handy.
export function celebrate(from?: HTMLElement | null) {
  const rect = from?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

  const host = document.createElement('div');
  host.className = 'confetti-host';
  host.style.left = `${cx}px`;
  host.style.top = `${cy}px`;
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 130;
    p.className = 'confetti-piece';
    p.style.background = COLORS[i % COLORS.length];
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    // Bias upward so it reads as a toss, gravity implied by the fade.
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
    p.style.animationDelay = `${Math.random() * 80}ms`;
    host.appendChild(p);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 1100);

  if (soundEnabled) chime();
}
