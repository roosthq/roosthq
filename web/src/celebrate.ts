// Completion celebration: a confetti burst (DOM + CSS, no dependencies) and
// a sound from this family's #1 sound library (sounds.ts - defaults to the
// original two-note chime until a family assigns something else). Sound is
// on by default on every surface - phones/tablets/desktop included - since it
// only ever fires from a user's own tap (which also satisfies autoplay
// policies). The kiosk overrides it from its DisplayConfig soundEffects toggle.

import { playSlotSound } from './sounds';

const COLORS = ['#4e7a4c', '#d4c06a', '#6eaa6c', '#d4ead0', '#e07c5c', '#5baedd', '#b58ae0'];

let soundEnabled = true;
export function setCelebrationSound(on: boolean) {
  soundEnabled = on;
}

// Burst confetti from the center of `from` (usually the tapped button), or
// screen-center when no element is handy. `slot` picks which of this
// family's assigned sounds plays - see SOUND_SLOTS in sounds.ts.
function burst(cx: number, cy: number, pieces: number, reach: number) {
  const host = document.createElement('div');
  host.className = 'confetti-host';
  host.style.left = `${cx}px`;
  host.style.top = `${cy}px`;
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('span');
    const angle = Math.random() * Math.PI * 2;
    const dist = (60 + Math.random() * 130) * reach;
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
}

export function celebrate(from?: HTMLElement | null, slot: string = 'notification') {
  const rect = from?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  burst(cx, cy, 26, 1);
  if (soundEnabled) playSlotSound(slot);
}

// A full-screen show for a big moment (an award, say): one sound, then a
// volley of larger bursts scattered across the upper screen over ~2.5s.
export function fireworks(slot: string = 'notification') {
  if (soundEnabled) playSlotSound(slot);
  for (let i = 0; i < 9; i++) {
    setTimeout(() => {
      burst(window.innerWidth * (0.12 + Math.random() * 0.76), window.innerHeight * (0.12 + Math.random() * 0.5), 42, 1.5);
    }, i * 280);
  }
}
