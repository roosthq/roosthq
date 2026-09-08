import type { MiniGameConfig } from './api';

// The full ten-game roster from the Task Deck prototypes (PLANNING.md §18)
// - icon + name + a sensible default config for each. Shared between
// MiniGamesTab (the New-game form's type picker/defaults) and
// KioskTestPanel (owner preview list) so both stay in sync automatically
// instead of keeping two hand-copied lists.
export const GAME_TYPES: { value: string; label: string; icon: string; ported: boolean }[] = [
  { value: 'PIN_TUMBLER', label: 'Pin & Tumbler', icon: '🗝️', ported: true },
  { value: 'SAFE_CRACKER', label: 'Safe Cracker', icon: '🔐', ported: true },
  { value: 'WIRE_SPLICE', label: 'Wire Splice', icon: '🔌', ported: true },
  { value: 'SIGNAL_RELAY', label: 'Signal Relay', icon: '📡', ported: true },
  { value: 'CARGO_SORT', label: 'Cargo Sort', icon: '📦', ported: true },
  { value: 'FUSE_TRACE', label: 'Fuse Trace', icon: '⚡', ported: true },
  { value: 'REACTOR_CALIBRATION', label: 'Reactor Calibration', icon: '☢️', ported: true },
  { value: 'BUG_ZAPPER', label: 'Bug Zapper', icon: '🪲', ported: true },
  { value: 'CIRCUIT_MATCH', label: 'Circuit Match', icon: '🧩', ported: true },
  { value: 'CODE_BREAKER', label: 'Code Breaker', icon: '💻', ported: true },
];
export function gameTypeMeta(value: string) {
  return GAME_TYPES.find((g) => g.value === value) ?? GAME_TYPES[0];
}

// Default config per gameType - the same defaults each game's own
// ConfigEditor branch falls back to when a field is missing.
export const DEFAULT_CONFIG: Record<string, MiniGameConfig> = {
  PIN_TUMBLER: { steps: 5, timeLimit: 25, misses: 3, difficulty: 1 },
  SAFE_CRACKER: { steps: 3, timeLimit: 35, misses: 3, difficulty: 1 },
  WIRE_SPLICE: { steps: 5, timeLimit: 20, difficulty: 1 },
  SIGNAL_RELAY: { steps: 6, timeLimit: 40, colors: 4, difficulty: 1 },
  CARGO_SORT: { steps: 6, timeLimit: 25, difficulty: 1 },
  FUSE_TRACE: { steps: 3, timeLimit: 25, difficulty: 1 },
  REACTOR_CALIBRATION: { timeLimit: 25, holdGoal: 2, difficulty: 1 },
  BUG_ZAPPER: { steps: 12, timeLimit: 18, difficulty: 1 },
  CIRCUIT_MATCH: { steps: 5, timeLimit: 35, difficulty: 1 },
  CODE_BREAKER: { steps: 4, timeLimit: 50, guesses: 7, difficulty: 1 },
};
