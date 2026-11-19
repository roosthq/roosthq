// One master volume + mute for everything this page plays: the synthesized
// chimes (sounds.ts), the mini-game cues (gameSfx.ts), family-uploaded clips,
// and the Learning animal sounds (QuestionMedia.tsx). It lives on the DEVICE
// (localStorage), not in the family's settings: the wall kiosk in the kitchen
// and a phone in a school pickup line want different volumes, and turning the
// kiosk down must never turn anyone else's phone down.
//
// Everything defaults to full volume / not muted, so a device nobody has
// touched behaves exactly as it always did. Only the kiosk shows a control
// (KioskVolume.tsx); other devices use their own hardware volume.

import { useSyncExternalStore } from 'react';

const KEY = 'rhq-audio-master';

export interface AudioState {
  /** 0..1 slider position (not the gain; see gainFor). */
  volume: number;
  muted: boolean;
}

function load(): AudioState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<AudioState> | null;
    const v = typeof raw?.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : 1;
    return { volume: v, muted: raw?.muted === true };
  } catch {
    return { volume: 1, muted: false };
  }
}

let state: AudioState = load();
const listeners = new Set<() => void>();
let masterGain: GainNode | null = null;

// A slider position is not loudness: ears hear roughly the square of a linear
// gain as "half as loud", so the bottom of a linear slider is already far too
// quiet to matter and the top 20% does nothing. Squaring it makes the middle of
// the slider sound like the middle.
function gainFor(s: AudioState): number {
  return s.muted ? 0 : s.volume * s.volume;
}

/** The 0..1 gain to apply to an <audio> element's `.volume` right now. */
export function effectiveVolume(): number {
  return gainFor(state);
}

export function getAudioState(): AudioState {
  return state;
}

function commit(next: AudioState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: the setting just lasts until the page reloads */
  }
  if (masterGain) masterGain.gain.value = gainFor(state);
  listeners.forEach((fn) => fn());
}

export function setVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  // Dragging the slider up from silence should be audible; a muted device
  // whose slider moves is clearly being turned back on.
  commit({ volume: v, muted: v === 0 ? state.muted : false });
}

export function setMuted(muted: boolean) {
  // Unmuting with the slider parked at zero would change nothing audible.
  commit({ volume: !muted && state.volume === 0 ? 0.6 : state.volume, muted });
}

export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook: re-renders when the master volume or mute changes. */
export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribeAudio, getAudioState, getAudioState);
}

/**
 * The node every WebAudio source should connect to instead of
 * `ctx.destination`. One GainNode per AudioContext, created lazily.
 */
export function masterNode(c: AudioContext): AudioNode {
  if (!masterGain || masterGain.context !== c) {
    masterGain = c.createGain();
    masterGain.gain.value = gainFor(state);
    masterGain.connect(c.destination);
  }
  return masterGain;
}

/** Apply the master volume to a media element (call before play()). */
export function applyMasterVolume(el: HTMLMediaElement) {
  el.volume = gainFor(state);
}
