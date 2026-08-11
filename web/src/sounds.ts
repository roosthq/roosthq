// The sound library backing #1 (More sound options): 10 synthesized
// built-ins (WebAudio oscillator "recipes" - no audio assets to ship/license,
// same approach celebrate.ts's original single chime already used) plus
// whatever custom clips a family has uploaded, assignable per action slot.
// Playback is always client-side, tied to whoever's own tap triggered it -
// same rule celebrate.ts documents for the original chime.

export interface SoundAssignment {
  type: 'builtin' | 'custom';
  id: string;
}

export const SOUND_SLOTS: { id: string; label: string; help: string }[] = [
  { id: 'choreCompleted', label: 'Chore completed', help: 'A kid marks a chore done' },
  { id: 'choreApproved', label: 'Chore approved', help: 'An adult approves it' },
  { id: 'streakMilestone', label: 'Streak milestone', help: 'A streak goal is hit on approval' },
  { id: 'redemptionFulfilled', label: 'Redemption fulfilled', help: 'A prize gets marked ready' },
  { id: 'rewardGameWin', label: 'Reward game win', help: 'A wheel/box/card/slot reveals a prize' },
  { id: 'levelUp', label: 'Level up', help: 'Someone reaches a new level' },
  { id: 'notification', label: 'Notification (generic)', help: 'Anything else that dings' },
];

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

// One oscillator burst: a frequency (or [start, end] to sweep), a shape, and
// an ADSR-lite envelope (attack up to `peak`, exponential decay to near-zero
// by `end`). `at` offsets this note's start within the overall recipe.
function note(
  c: AudioContext,
  t0: number,
  {
    freq,
    type = 'sine',
    at = 0,
    attack = 0.015,
    end = 0.22,
    peak = 0.18,
  }: {
    freq: number | [number, number];
    type?: OscillatorType;
    at?: number;
    attack?: number;
    end?: number;
    peak?: number;
  },
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const start = t0 + at;
  osc.type = type;
  if (Array.isArray(freq)) {
    osc.frequency.setValueAtTime(freq[0], start);
    osc.frequency.exponentialRampToValueAtTime(freq[1], start + end);
  } else {
    osc.frequency.value = freq;
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + end);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + end + 0.02);
}

type Recipe = (c: AudioContext, t0: number) => void;

const RECIPES: Record<string, Recipe> = {
  chime: (c, t0) => {
    note(c, t0, { freq: 987.77, type: 'triangle', at: 0 });
    note(c, t0, { freq: 1318.51, type: 'triangle', at: 0.09 });
  },
  pop: (c, t0) => {
    note(c, t0, { freq: 320, type: 'square', attack: 0.005, end: 0.06, peak: 0.15 });
  },
  coin: (c, t0) => {
    note(c, t0, { freq: 988, type: 'square', at: 0, end: 0.08, peak: 0.14 });
    note(c, t0, { freq: 1976, type: 'square', at: 0.05, end: 0.16, peak: 0.14 });
  },
  successBell: (c, t0) => {
    note(c, t0, { freq: 523.25, at: 0, end: 0.18 });
    note(c, t0, { freq: 659.25, at: 0.1, end: 0.18 });
    note(c, t0, { freq: 783.99, at: 0.2, end: 0.26 });
  },
  sparkle: (c, t0) => {
    [1568, 1976, 2349, 2637, 3136].forEach((freq, i) =>
      note(c, t0, { freq, type: 'triangle', at: i * 0.045, attack: 0.006, end: 0.09, peak: 0.09 }),
    );
  },
  xylophone: (c, t0) => {
    note(c, t0, { freq: 659.25, type: 'triangle', attack: 0.004, end: 0.28, peak: 0.16 });
    note(c, t0, { freq: 1318.51, type: 'triangle', attack: 0.004, end: 0.16, peak: 0.05 });
  },
  whooshUp: (c, t0) => {
    note(c, t0, { freq: [180, 1400], type: 'sawtooth', attack: 0.05, end: 0.32, peak: 0.1 });
  },
  bloop: (c, t0) => {
    note(c, t0, { freq: 220, at: 0, attack: 0.02, end: 0.16, peak: 0.15 });
    note(c, t0, { freq: 262, at: 0.1, attack: 0.02, end: 0.2, peak: 0.15 });
  },
  fanfare: (c, t0) => {
    note(c, t0, { freq: 523.25, type: 'sawtooth', end: 0.32, peak: 0.09 });
    note(c, t0, { freq: 659.25, type: 'sawtooth', end: 0.32, peak: 0.09 });
    note(c, t0, { freq: 783.99, type: 'sawtooth', end: 0.36, peak: 0.09 });
  },
  gentleDing: (c, t0) => {
    note(c, t0, { freq: 880, attack: 0.03, end: 0.4, peak: 0.08 });
  },
};

export const BUILTIN_SOUNDS: { id: string; label: string; hint: string }[] = [
  { id: 'chime', label: 'Chime', hint: "today's default - two-note rise" },
  { id: 'pop', label: 'Pop', hint: 'short, percussive click' },
  { id: 'coin', label: 'Coin', hint: 'bright metallic ping' },
  { id: 'successBell', label: 'Success bell', hint: 'three ascending tones' },
  { id: 'sparkle', label: 'Sparkle', hint: 'fast high-pitched flutter' },
  { id: 'xylophone', label: 'Xylophone', hint: 'warm wooden knock, pitched' },
  { id: 'whooshUp', label: 'Whoosh-up', hint: 'rising sweep, no landing note' },
  { id: 'bloop', label: 'Bloop', hint: 'low, playful double-note' },
  { id: 'fanfare', label: 'Fanfare', hint: 'short triumphant chord' },
  { id: 'gentleDing', label: 'Gentle ding', hint: 'single soft tone, low-key notifications' },
];

export function playBuiltinSound(id: string) {
  try {
    const recipe = RECIPES[id] ?? RECIPES.chime;
    const c = ctx();
    recipe(c, c.currentTime);
  } catch {
    // No AudioContext (old browser, blocked autoplay) - never an error.
  }
}

// Custom uploads are a real audio clip (data: URI), not a recipe - play them
// with a plain <audio> element instead of synthesizing anything.
export function playCustomSound(dataUri: string) {
  try {
    const el = new Audio(dataUri);
    void el.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

// Global, family-wide assignment cache - populated once after login/kiosk
// load (App.tsx/Display.tsx), same pattern celebrate.ts's setCelebrationSound
// already uses for the on/off toggle.
let assignments: Record<string, SoundAssignment> = {};
let customSounds: Record<string, string> = {}; // id -> dataUri

export function setSoundAssignments(a: Record<string, SoundAssignment> | undefined, custom: { id: string; dataUri: string }[] | undefined) {
  assignments = a ?? {};
  customSounds = Object.fromEntries((custom ?? []).map((c) => [c.id, c.dataUri]));
}

// Plays whatever this family assigned to `slot`, falling back to the
// original default chime when nothing's been assigned yet.
export function playSlotSound(slot: string) {
  const a = assignments[slot];
  if (!a) return playBuiltinSound('chime');
  if (a.type === 'custom') {
    const dataUri = customSounds[a.id];
    if (dataUri) return playCustomSound(dataUri);
    return playBuiltinSound('chime'); // assignment points at a deleted upload
  }
  playBuiltinSound(a.id);
}
