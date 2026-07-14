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

export interface Me {
  id: string;
  displayName: string;
  email?: string;
  role: string;
  avatar?: string;
  familyId: string;
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
  checks: Array<{ checklistId: string }>;
}

export interface Chore {
  id: string;
  title: string;
  tokenValue: number;
  recurrenceRule?: string;
  assignee: { id: string; displayName: string };
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
  mintDisplayToken: (label?: string) =>
    req<MintedToken>('/display/tokens', { method: 'POST', body: JSON.stringify({ label }) }),
  revokeDisplayToken: (id: string) => req(`/display/tokens/${id}`, { method: 'DELETE' }),

  listUsers: () => req<Member[]>('/users'),
  setUserPin: (id: string, pin: string | null) =>
    req(`/users/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }),
  setUserRole: (id: string, role: 'OWNER' | 'ADULT' | 'KID') =>
    req(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  removeUser: (id: string) => req(`/users/${id}`, { method: 'DELETE' }),

  listInvites: () => req<InviteInfo[]>('/invites'),
  createInvite: (role: 'ADULT' | 'KID', label?: string) =>
    req<MintedInvite>('/invites', { method: 'POST', body: JSON.stringify({ role, label }) }),
  revokeInvite: (id: string) => req(`/invites/${id}`, { method: 'DELETE' }),

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
    createChore: (body: Record<string, unknown>) =>
      req<Chore>('/chores', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
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
