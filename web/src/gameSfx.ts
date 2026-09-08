// Mini-games' own interaction sounds - click/hit/miss/notch/etc, ported
// verbatim from the Task Deck prototype's own `SFX` object (PLANNING.md
// §18). Distinct from sounds.ts's celebration slots (those are a family's
// own assignable choice for "a chore got done"; these are fixed per-game
// feedback cues, not something anyone reassigns) but sharing sounds.ts's
// one lazily-created AudioContext rather than opening a second one.
//
// Safe Cracker in particular has exactly ONE cue (notch(), the instant the
// dial crosses into the combo zone) and nothing else - that's not a
// leftover gap, it's the actual game: Normal/Hard hide every visual tell,
// so without this sound it's unplayable blind, not just quieter.

import { ctx } from './sounds';

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gainPeak = 0.18, delay = 0) {
  try {
    const c = ctx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // Audio unavailable - fail silent, same as every other sound call site.
  }
}
function sweep(f0: number, f1: number, dur: number, type: OscillatorType = 'triangle', gainPeak = 0.18) {
  try {
    const c = ctx();
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // ignore
  }
}

export const gameSfx = {
  click: () => tone(880, 0.05, 'square', 0.08),
  tick: () => tone(1200, 0.03, 'square', 0.05),
  hit: () => {
    tone(660, 0.09, 'triangle', 0.16);
    tone(990, 0.12, 'sine', 0.12, 0.04);
  },
  miss: () => sweep(320, 140, 0.22, 'sawtooth', 0.15),
  step: () => tone(520, 0.07, 'sine', 0.14),
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, i * 0.09));
  },
  lose: () => sweep(300, 90, 0.5, 'sawtooth', 0.16),
  warn: () => tone(1400, 0.06, 'square', 0.09),
  note: (freq: number, dur = 0.3) => tone(freq, dur, 'sine', 0.2),
  // Safe Cracker's one and only sound - a genuinely short, sharp transient
  // (two micro-pulses: a crisp tick, a tiny lower knock right after).
  notch: () => {
    tone(2200, 0.018, 'square', 0.28);
    tone(700, 0.03, 'square', 0.14, 0.006);
  },
  // Bug Zapper's hit - a fast descending buzzy sawtooth plus a tiny high
  // crack layered slightly after, distinct from the generic hit() chime.
  zap: () => {
    sweep(3000, 200, 0.09, 'sawtooth', 0.22);
    tone(4200, 0.02, 'square', 0.15, 0.01);
  },
};
