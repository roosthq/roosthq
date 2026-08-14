// Self-contained store for slot icon overrides (icon-overhaul, 2026-08).
// Deliberately NOT wired through App.tsx/Display.tsx's own component trees -
// this fetches itself, on first use, from whichever context it's running in
// (normal signed-in app vs the kiosk's pre-login display-token session), so
// LucideIcon (the only consumer) works everywhere it's already used without
// either root component needing to thread anything through.
import { useSyncExternalStore } from 'react';
import { api } from '../api';
import { dget, displayToken } from '../displayApi';

export interface SlotPick {
  iconKey: string;
  iconSet: string;
}

interface EffectiveResponse {
  effective: Record<string, SlotPick>;
  familySlots: Record<string, SlotPick>;
  appSlots: Record<string, SlotPick>;
}

let effective: Record<string, SlotPick> = {};
let loaded = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function load(): Promise<void> {
  try {
    // Display.tsx runs with a ?token= display token before anyone's picked a
    // kiosk profile - that has no session cookie yet, so it must go through
    // the display-token-accepting /display/icons route instead of /icons/effective.
    const res: EffectiveResponse = displayToken ? await dget('/display/icons') : await api.iconSettings();
    effective = res.effective ?? {};
  } catch {
    // Network hiccup or not-signed-in-yet - keep whatever we had (empty map
    // on first failure just means every slot falls back to its own
    // hardcoded default, never a crash).
  } finally {
    loaded = true;
    notify();
  }
}

export function refreshIconSettings(): void {
  inFlight = load();
}

function ensureLoaded(): void {
  if (!loaded && !inFlight) refreshIconSettings();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => listeners.delete(listener);
}

function getSnapshot(): Record<string, SlotPick> {
  return effective;
}

// The family/app pick for a slot id, or undefined if nothing overrides it
// (render the slot's own hardcoded default) or settings haven't loaded yet.
export function useSlotPick(slotId: string | undefined): SlotPick | undefined {
  const map = useSyncExternalStore(subscribe, getSnapshot);
  return slotId ? map[slotId] : undefined;
}
