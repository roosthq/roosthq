// Same-origin by default: the reverse proxy (Caddy behind the Cloudflare Tunnel)
// routes /api to the server. In dev, the Vite proxy forwards /api to localhost:3000.
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// kioskToken: when set, authenticate as a kiosk-selected profile (x-kiosk-token
// header) instead of the browser session cookie.
async function req<T>(path: string, init?: RequestInit, kioskToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (kioskToken) headers['x-kiosk-token'] = kioskToken;
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const loginUrl = `${BASE}/auth/google`;

export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

export interface Me {
  id: string;
  displayName: string;
  email?: string;
  role: string;
  avatar?: string;
  familyId: string;
  themePref?: 'light' | 'dark';
  fontSizePref?: FontSize;
}

export interface GoogleCalendar {
  googleAccountId: string;
  googleCalendarId: string;
  name: string;
  color?: string;
  primary: boolean;
}

export interface SharedCalendar {
  id: string;
  name: string;
  color?: string;
  googleCalendarId: string;
  shareCount: number;
  sharedByMe: boolean;
}

export interface CalEvent {
  id: string;
  uid: string;
  calendarId: string;
  calendarColor?: string;
  calendarName?: string;
  ownerName?: string;
  ownerAvatar?: string;
  title?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
}

export interface Member {
  id: string;
  displayName: string;
  role: string;
  avatar?: string;
  hasPin?: boolean;
}

export interface UnlockResult {
  token: string;
  user: { id: string; displayName: string; role: string; avatar?: string };
}

export interface DisplaySettings {
  familyId: string;
  defaultCalendarIds: string[];
  enabledFeatures: string[];
  theme: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  sort: number;
  required: boolean;
}

export interface ChoreInstance {
  id: string;
  dueDate: string;
  status: 'OPEN' | 'PENDING' | 'APPROVED' | 'REJECTED';
  completedAt?: string;
  claimedByUserId?: string | null;
  checks: Array<{ checklistId: string }>;
}

export interface ChoreAssigneeRef {
  userId: string;
  user: { id: string; displayName: string; avatar?: string };
}

export interface Chore {
  id: string;
  title: string;
  tokenValue: number;
  recurrenceRule?: string;
  dayOfWeek?: number | null;
  assignmentType: 'SPECIFIC' | 'ANYONE';
  assignees: ChoreAssigneeRef[];
  location?: { id: string; name: string } | null;
  checklist: ChecklistItem[];
  instances: ChoreInstance[];
}

export interface Balance {
  userId: string;
  balance: number;
}

export interface DisplayTokenInfo {
  id: string;
  label?: string;
  displayConfigId?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface MintedToken {
  id: string;
  label?: string;
  token: string;
}

export interface InviteInfo {
  id: string;
  role: string;
  label?: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export interface MintedInvite {
  id: string;
  role: string;
  label?: string;
  token: string;
}

export interface FamilySettings {
  id: string;
  name: string;
  tokenName: string;
  tokenIcon: string;
  tokenValueUsd: number;
  choreWord: string;
}

// Naive English pluralization — good enough for a family-chosen word like
// "Chore" -> "Chores" or "Quest" -> "Quests"; families with an irregular word
// can just type the plural form they want with a trailing "s" already there.
export function pluralize(word: string): string {
  return word.endsWith('s') ? word : `${word}s`;
}

export interface FamilyLocation {
  id: string;
  name: string;
  users: Array<{ userId: string }>;
}

export interface DisplayConfig {
  id: string;
  name: string;
  locationId: string | null;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
  fontSize: FontSize;
}

// The resolved config a kiosk renders (id may be null for legacy/default).
export interface ResolvedDisplayConfig {
  id: string | null;
  name: string;
  locationId: string | null;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
  fontSize: FontSize;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  type: 'CHORE' | 'MANUAL' | 'PHYSICAL' | 'REDEEM';
  refId?: string | null;
  createdAt: string;
}

export interface StorePrize {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  realPrice?: string | number | null;
  tokenCost: number;
  type: 'ITEM' | 'EVENT';
  scope: 'GLOBAL' | 'SPECIFIC';
  assignedUserIds: string[];
  location?: { id: string; name: string } | null;
}

export interface Redemption {
  id: string;
  prizeId: string;
  userId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  requestedAt: string;
  prize: { name: string; tokenCost: number; type: string };
}

export const BASE_URL = BASE;
export const displayStreamUrl = `${BASE}/display/stream`;

export const api = {
  me: () => req<Me>('/auth/me'),
  members: () => req<Member[]>('/auth/members'),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  googleCalendars: () => req<GoogleCalendar[]>('/calendars/google'),
  sharedCalendars: () => req<SharedCalendar[]>('/calendars'),
  share: (googleAccountId: string, selections: Array<{ googleCalendarId: string; name: string; color?: string }>) =>
    req('/calendars/share', { method: 'POST', body: JSON.stringify({ googleAccountId, selections }) }),
  events: (calendarIds: string[], start: string, end: string) =>
    req<CalEvent[]>(`/calendars/events?calendarIds=${calendarIds.join(',')}&start=${start}&end=${end}`),

  displaySettings: () => req<DisplaySettings>('/display/settings'),
  updateDisplaySettings: (data: Partial<DisplaySettings>) =>
    req<DisplaySettings>('/display/settings', { method: 'PUT', body: JSON.stringify(data) }),

  listDisplayTokens: () => req<DisplayTokenInfo[]>('/display/tokens'),
  mintDisplayToken: (label?: string, displayConfigId?: string) =>
    req<MintedToken>('/display/tokens', { method: 'POST', body: JSON.stringify({ label, displayConfigId }) }),
  revokeDisplayToken: (id: string) => req(`/display/tokens/${id}`, { method: 'DELETE' }),

  listDisplays: () => req<DisplayConfig[]>('/displays'),
  createDisplay: (body: {
    name: string;
    locationId?: string | null;
    calendarIds?: string[];
    enabledFeatures?: string[];
    theme?: string;
    fontSize?: FontSize;
  }) => req<DisplayConfig>('/displays', { method: 'POST', body: JSON.stringify(body) }),
  updateDisplay: (
    id: string,
    body: Partial<{
      name: string;
      locationId: string | null;
      calendarIds: string[];
      enabledFeatures: string[];
      theme: string;
      fontSize: FontSize;
    }>,
  ) => req<DisplayConfig>(`/displays/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDisplay: (id: string) => req(`/displays/${id}`, { method: 'DELETE' }),
  // Calendars selectable for a display: all shared calendars, or (scoped) only
  // those shared by someone assigned to that location.
  displaysCalendars: (locationId?: string | null) =>
    req<SharedCalendar[]>(`/displays/calendars${locationId ? `?locationId=${locationId}` : ''}`),

  listUsers: () => req<Member[]>('/users'),
  setUserPin: (id: string, pin: string | null) =>
    req(`/users/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }),
  setUserRole: (id: string, role: 'OWNER' | 'ADULT' | 'KID') =>
    req(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  removeUser: (id: string) => req(`/users/${id}`, { method: 'DELETE' }),
  setTheme: (theme: 'light' | 'dark') =>
    req<{ ok: boolean; theme: string }>('/users/me/theme', { method: 'PUT', body: JSON.stringify({ theme }) }),
  setFontSize: (fontSize: FontSize) =>
    req<{ ok: boolean; fontSize: string }>('/users/me/font-size', { method: 'PUT', body: JSON.stringify({ fontSize }) }),

  listInvites: () => req<InviteInfo[]>('/invites'),
  createInvite: (role: 'ADULT' | 'KID', label?: string) =>
    req<MintedInvite>('/invites', { method: 'POST', body: JSON.stringify({ role, label }) }),
  revokeInvite: (id: string) => req(`/invites/${id}`, { method: 'DELETE' }),

  familySettings: () => req<FamilySettings>('/family/settings'),
  updateFamilySettings: (data: { name?: string; tokenName?: string; tokenIcon?: string; tokenValueUsd?: number; choreWord?: string }) =>
    req<FamilySettings>('/family/settings', { method: 'PUT', body: JSON.stringify(data) }),

  tokenBalances: () => req<Array<{ userId: string; balance: number }>>('/tokens/balances'),
  tokenBalance: (userId?: string) =>
    req<{ userId: string; balance: number }>(`/tokens/balance${userId ? `?userId=${userId}` : ''}`),
  tokenLedger: (userId?: string) =>
    req<LedgerEntry[]>(`/tokens/ledger${userId ? `?userId=${userId}` : ''}`),
  adjustTokens: (body: { userId: string; delta: number; reason: string; type?: 'MANUAL' | 'PHYSICAL' }) =>
    req<LedgerEntry>('/tokens/adjust', { method: 'POST', body: JSON.stringify(body) }),

  locations: () => req<FamilyLocation[]>('/locations'),
  createLocation: (name: string) => req<FamilyLocation>('/locations', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteLocation: (id: string) => req(`/locations/${id}`, { method: 'DELETE' }),
  assignLocation: (id: string, userId: string) =>
    req(`/locations/${id}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
  unassignLocation: (id: string, userId: string) => req(`/locations/${id}/users/${userId}`, { method: 'DELETE' }),

  prizes: () => req<StorePrize[]>('/prizes'),
  createPrize: (body: Record<string, unknown>) =>
    req<StorePrize>('/prizes', { method: 'POST', body: JSON.stringify(body) }),
  updatePrize: (id: string, body: Record<string, unknown>) =>
    req<StorePrize>(`/prizes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePrize: (id: string) => req(`/prizes/${id}`, { method: 'DELETE' }),
  redeemPrize: (id: string) => req(`/prizes/${id}/redeem`, { method: 'POST' }),
  redemptions: (userId?: string) =>
    req<Redemption[]>(`/prizes/redemptions${userId ? `?userId=${userId}` : ''}`),
  fulfillRedemption: (id: string) => req(`/prizes/redemptions/${id}/fulfill`, { method: 'POST' }),
  rejectRedemption: (id: string) => req(`/prizes/redemptions/${id}/reject`, { method: 'POST' }),

  chores: () => req<Chore[]>('/chores'),
  balances: () => req<Balance[]>('/chores/balances'),
  createChore: (body: Record<string, unknown>) =>
    req<Chore>('/chores', { method: 'POST', body: JSON.stringify(body) }),
  checkItem: (instanceId: string, checklistId: string, checked: boolean) =>
    req(`/chores/instances/${instanceId}/check`, { method: 'POST', body: JSON.stringify({ checklistId, checked }) }),
  completeInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/complete`, { method: 'POST' }),
  approveInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/approve`, { method: 'POST' }),
  rejectInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/reject`, { method: 'POST' }),
};

// Chore/member operations bound to an auth context: the browser cookie (default)
// or a kiosk token (when acting as a profile selected on the touch hub).
export function choreClient(kioskToken?: string) {
  return {
    chores: () => req<Chore[]>('/chores', undefined, kioskToken),
    balances: () => req<Balance[]>('/chores/balances', undefined, kioskToken),
    members: () => req<Member[]>('/auth/members', undefined, kioskToken),
    familySettings: () => req<FamilySettings>('/family/settings', undefined, kioskToken),
    locations: () => req<FamilyLocation[]>('/locations', undefined, kioskToken),
    createChore: (body: Record<string, unknown>) =>
      req<Chore>('/chores', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
    updateChore: (id: string, body: Record<string, unknown>) =>
      req<Chore>(`/chores/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, kioskToken),
    deleteChore: (id: string) => req(`/chores/${id}`, { method: 'DELETE' }, kioskToken),
    reopenChore: (id: string) => req(`/chores/${id}/reopen`, { method: 'POST' }, kioskToken),
    claimInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/claim`, { method: 'POST' }, kioskToken),
    assignInstance: (instanceId: string, userId: string | null) =>
      req(`/chores/instances/${instanceId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }, kioskToken),
    checkItem: (instanceId: string, checklistId: string, checked: boolean) =>
      req(`/chores/instances/${instanceId}/check`, { method: 'POST', body: JSON.stringify({ checklistId, checked }) }, kioskToken),
    completeInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/complete`, { method: 'POST' }, kioskToken),
    approveInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/approve`, { method: 'POST' }, kioskToken),
    rejectInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/reject`, { method: 'POST' }, kioskToken),
  };
}

export type ChoreClient = ReturnType<typeof choreClient>;
