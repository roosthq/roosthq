// Same-origin by default: the reverse proxy (Caddy behind the Cloudflare Tunnel)
// routes /api to the server. In dev, the Vite proxy forwards /api to localhost:3000.
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// kioskToken: when set, authenticate as a kiosk-selected profile (x-kiosk-token
// header) instead of the browser session cookie.
async function req<T>(path: string, init?: RequestInit, kioskToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (kioskToken) headers['x-kiosk-token'] = kioskToken;
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...init, headers });
  if (!res.ok) {
    // Surface the server's actual message (e.g. "Password must be at least
    // 8 characters") instead of a generic "400 Bad Request" - every caller
    // that does `catch (e) { alert(e.message) }` benefits, not just new ones.
    const body = await res.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message[0] : null;
    throw new Error(message || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const loginUrl = `${BASE}/auth/google`;

export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

export interface SearchHit {
  id: string;
  label: string;
  sublabel?: string;
  link: string;
}

export interface SearchResult {
  chores: SearchHit[];
  events: SearchHit[];
  notifications: SearchHit[];
  rules: SearchHit[];
  prizes: SearchHit[];
  awards: SearchHit[];
}

export interface Me {
  id: string;
  displayName: string;
  email?: string;
  username?: string;
  role: string;
  avatar?: string;
  familyId: string;
  themePref?: 'light' | 'dark';
  colorTheme?: string;
  fontSizePref?: FontSize;
  soundEffects?: boolean;
  simpleMode?: boolean;
  birthday?: string | null;
  disabledPermissions?: string[];
  notifyByEmail?: boolean;
  // Whether a local password is set - never the hash itself. Drives whether
  // the password-change form asks for the current one at all.
  hasPassword?: boolean;
  // Set only while the instance owner is ghosting as this account.
  ghostedBy?: { id: string; displayName: string } | null;
}

export interface GoogleAccountInfo {
  id: string;
  email: string | null;
  picture: string | null;
  needsReconnect: boolean;
  createdAt: string;
}

export interface FamilyInfo {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  targetLabel: string | null;
  detail: string | null;
  createdAt: string;
}

export type HolidayRuleType = 'FIXED' | 'NTH_WEEKDAY' | 'EASTER_OFFSET';

export interface HolidayRule {
  id: string;
  title: string;
  ruleType: HolidayRuleType;
  month: number | null;
  day: number | null;
  weekday: number | null;
  ordinal: number | null;
  offsetDays: number | null;
  createdAt: string;
  // Only present on the list() response (server computes it fresh each
  // time) - the soonest occurrence on or after today, ISO date or null for
  // a malformed row.
  nextOccurrence?: string | null;
}

export type HolidayRuleInput = Omit<HolidayRule, 'id' | 'createdAt'>;

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
  image?: string | null;
  googleCalendarId?: string;
  shareCount?: number;
  sharedByMe?: boolean;
  source?: 'google' | 'local' | 'holiday';
  locationId?: string | null;
}

export interface LocalCalendarInput {
  name: string;
  color?: string;
  image?: string | null;
  locationId?: string | null;
}

export interface LocalEventInput {
  title: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  start: string;
  end: string;
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
  description?: string;
  addedByUserId?: string;
  addedByName?: string;
}

// Mirrors the Google Calendar event resource shape closely enough to build
// all-day, multi-day, and timed events from one form.
export interface EventInput {
  summary: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  location?: string;
  description?: string;
}

export interface Member {
  id: string;
  displayName: string;
  role: string;
  avatar?: string;
  hasPin?: boolean;
  colorTheme?: string;
  email?: string;
  tokensDisabled?: boolean;
  simpleMode?: boolean;
  allowanceTokens?: number;
  birthday?: string | null; // YYYY-MM-DD
  disabledPermissions?: string[];
  username?: string | null;
  active?: boolean; // instance-owner lockout switch (owner member lists only)
  pinDisabled?: boolean; // kid-only: PIN capability turned off entirely (can't have one)
}

export interface UnlockResult {
  token: string;
  user: { id: string; displayName: string; role: string; avatar?: string; colorTheme?: string };
}

// Kiosk-identifiable per-person full page theme ("micro-theme") - swaps the
// whole palette (bg/surface/text/border/tags), not just an accent color. Keep
// in sync with COLOR_THEMES in server/src/users/users.service.ts.
export const COLOR_THEMES: { id: string; label: string; swatch: string }[] = [
  { id: 'meadow', label: 'Meadow', swatch: '#4e7a4c' },
  { id: 'ocean', label: 'Ocean', swatch: '#2a7bb8' },
  { id: 'ember', label: 'Ember', swatch: '#c85c3a' },
  { id: 'lavender', label: 'Lavender', swatch: '#7254c8' },
  { id: 'slate', label: 'Slate', swatch: '#3a5a8a' },
  { id: 'rose', label: 'Rose', swatch: '#b84878' },
  { id: 'sand', label: 'Sand', swatch: '#a07840' },
  { id: 'mint', label: 'Mint', swatch: '#2a9a78' },
  { id: 'midnight', label: 'Midnight', swatch: '#4a6ab8' },
];

// Shown next to a role anywhere it appears - profile switchers, the family
// member list in Settings, invite rows.
export const ROLE_ICON: Record<string, string> = {
  OWNER: '👑',
  FAMILY_MANAGER: '🗝️',
  ADULT: '🧑',
  KID: '🧒',
};

// Human-readable label for a role - needed anywhere a role gets displayed
// as text, since the raw enum value (FAMILY_MANAGER) doesn't read as UI copy.
export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  FAMILY_MANAGER: 'Family Manager',
  ADULT: 'Adult',
  KID: 'Kid',
};

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
  status: 'OPEN' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'MISSED' | 'SKIPPED';
  completedAt?: string;
  claimedByUserId?: string | null;
  checks: Array<{ checklistId: string }>;
  hasProof?: boolean; // photo attached (fetch via proofImage())
  // Adults only - the server omits this entirely for a kid's session.
  approvedByUser?: { id: string; displayName: string } | null;
}

// One row of the adults-only "did this actually work right" activity log -
// every occurrence of every chore (or one chore's, with choreId), unlike the
// main chore list's per-chore 5-row cap.
export interface ChoreHistoryEntry {
  id: string;
  choreId: string;
  choreTitle: string;
  status: 'OPEN' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'MISSED' | 'SKIPPED';
  dueDate: string;
  completedAt: string | null;
  claimedByUserId: string | null;
  claimedByName: string | null;
  approvedByUser: { id: string; displayName: string } | null;
}

// One entry in a chore's settings-change audit trail (create/edit/delete,
// who did it) - distinct from ChoreHistoryEntry above, which is per-occurrence
// activity (completed/approved), not a record of who changed what setting.
export interface ChoreAuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  targetLabel: string | null;
  detail: string | null;
  createdAt: string;
}

export interface PendingWheel {
  id: string;
  minTokens: number;
  maxTokens: number;
  reason: string;
  style: 'WHEEL' | 'MYSTERY_BOX' | 'SCRATCH_CARD' | 'SLOT_MACHINE';
}

export interface MealPlanEntry {
  id: string;
  locationId?: string | null; // null = family-wide
  date: string; // YYYY-MM-DD
  title: string;
  notes?: string | null;
  isEatingOut?: boolean;
  eatOutPlaceId?: string | null;
  eatOutPlaceName?: string | null; // null while isEatingOut but nobody's picked/spun a place yet
}

export interface EatOutPlace {
  id: string;
  name: string;
  notes?: string | null;
}

export interface GroceryItem {
  id: string;
  locationId?: string | null; // null = family-wide
  label: string;
  checked: boolean;
  createdAt: string;
}

export interface CountdownEntry {
  id: string;
  locationId?: string | null; // null = family-wide
  title: string;
  emoji: string;
  date: string; // YYYY-MM-DD
}

export interface AnnouncementEntry {
  id: string;
  locationId?: string | null; // null = family-wide
  text: string;
  createdAt: string;
  expiresAt?: string | null;
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
  daysOfWeek?: number[] | null;
  dueTime?: string | null;
  assignmentType: 'SPECIFIC' | 'ANYONE';
  assignees: ChoreAssigneeRef[];
  // timezone here (already returned by the server, just not typed before) -
  // "due today" for this chore has to mean today in its own location's
  // zone, not the viewing device's.
  location?: { id: string; name: string; timezone?: string } | null;
  // Adults only - who set this chore up (the server strips it for kids).
  createdBy?: { id: string; displayName: string } | null;
  checklist: ChecklistItem[];
  instances: ChoreInstance[];
  allowLate: boolean;
  allowSkip: boolean;
  autoApprove: boolean;
  requireProof: boolean;
  firstFinisherBonus: number;
  streakFreezes: number;
  latePenaltyPercent: number;
  currentStreak: number;
  bestStreak: number;
  streakGoal?: number | null;
  streakBonusTokens: number;
}

export interface Balance {
  userId: string;
  balance: number;
  earned?: number; // lifetime positive total - XP for the level badge
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  createdAt: string;
  readAt?: string | null;
  user?: { id: string; displayName: string }; // present in the family-wide activity view
}

export interface Rule {
  id: string;
  text: string;
  targetUserId: string | null; // null = shared, visible to every kid
  targetUserName: string | null;
  createdAt: string;
}

export interface AwardCatalogItem {
  id: string;
  wheelMin?: number;
  wheelMax?: number; // 0/undefined = no wheel
  name: string;
  icon: string | null;
  description: string | null;
  defaultTokenValue: number;
  grantCount: number;
}

export interface EarnedAward {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  count: number;
  // The adult's note on why each one was given, newest first, non-empty
  // only - a kid earning the same award repeatedly can have a different
  // reason each time.
  notes: string[];
}

export interface AwardGrantHistoryItem {
  id: string;
  award: { id: string; name: string; icon: string | null };
  user: { id: string; displayName: string };
  grantedBy: { id: string; displayName: string };
  note: string | null;
  tokenValue: number;
  createdAt: string;
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
  // Family-level feature switches - stored as the DISABLED list so new
  // features default on. See FAMILY_FEATURES.
  disabledFeatures: string[];
}

// Everything a family can turn off wholesale (Settings > This family >
// Features). The kiosk additionally gates its own widgets per display.
export const FAMILY_FEATURES: Array<{ id: string; label: string; help: string }> = [
  { id: 'levels', label: 'Levels & XP', help: 'Level badges from lifetime tokens earned - spending never lowers it.' },
  { id: 'streakFreeze', label: 'Streak freezes', help: 'Each streak milestone banks a freeze (max 3) that absorbs one missed day.' },
  { id: 'bonusWheel', label: 'Bonus wheel', help: 'A random 1-5 extra tokens on every streak milestone.' },
  { id: 'photoProof', label: 'Photo proof', help: 'Chores can require a photo before a kid can mark them done.' },
  { id: 'meals', label: 'Meal plan', help: "Plan dinners; the kiosk shows tonight's meal." },
  { id: 'grocery', label: 'Grocery list', help: 'Shared list anyone can add to and check off.' },
  { id: 'countdowns', label: 'Countdowns', help: 'Birthday/vacation countdown widgets.' },
  { id: 'announcements', label: 'Announcements', help: 'Short family-wide notices on the kiosk.' },
  { id: 'digest', label: 'Weekly digest', help: 'Sunday-evening summary of chores done and tokens earned, sent to adults.' },
  { id: 'allowance', label: 'Allowance', help: 'Automatic weekly token grants per person (set in Family & PINs).' },
  { id: 'leaderboard', label: 'Kid leaderboard', help: 'Ranks kids by level on the Profiles page. Off if sibling comparison is not something you want.' },
];

// Per-kid ability switches (User.disabledPermissions) - adults manage them
// per member in Family & PINs; the server enforces them for KID roles.
export const KID_PERMISSIONS: Array<{ id: string; label: string }> = [
  { id: 'grocery', label: 'Add & check grocery items' },
  { id: 'store', label: 'Redeem prizes from the store' },
  { id: 'calendarAdd', label: 'Add calendar events' },
];

export function kidPermissionEnabled(m: { role?: string; disabledPermissions?: string[] } | null | undefined, permission: string): boolean {
  if (!m || m.role !== 'KID') return true;
  return !(m.disabledPermissions ?? []).includes(permission);
}

export function familyFeatureEnabled(f: FamilySettings | null | undefined, feature: string): boolean {
  return !f?.disabledFeatures?.includes(feature);
}

// Level = XP badge derived from lifetime tokens EARNED (never reduced by
// spending). sqrt pacing: 1 at 0, 2 at 5, 3 at 20, 4 at 45, 5 at 80...
export function levelFor(earned: number): number {
  return Math.floor(Math.sqrt(Math.max(0, earned) / 5)) + 1;
}

// Naive English pluralization - good enough for a family-chosen word like
// "Chore" -> "Chores" or "Quest" -> "Quests"; families with an irregular word
// can just type the plural form they want with a trailing "s" already there.
export function pluralize(word: string): string {
  return word.endsWith('s') ? word : `${word}s`;
}

export interface FamilyLocation {
  id: string;
  name: string;
  timezone: string;
  users: Array<{ userId: string }>;
}

export interface DisplayConfig {
  id: string;
  name: string;
  locationId: string | null;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
  colorTheme: string;
  soundEffects: boolean;
  fontSize: FontSize;
  onScreenKeyboard: boolean;
  screensaverMinutes: number;
  weatherLocation: string | null;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
}

// The resolved config a kiosk renders (id may be null for legacy/default).
export interface ResolvedDisplayConfig {
  id: string | null;
  name: string;
  locationId: string | null;
  calendarIds: string[];
  enabledFeatures: string[];
  theme: string;
  colorTheme: string;
  soundEffects: boolean;
  fontSize: FontSize;
  onScreenKeyboard: boolean;
  screensaverMinutes: number;
  weatherLocation: string | null;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
}

// The kiosk screensaver's "at a glance" feed (GET /display/today). `date`
// (YYYY-MM-DD) is whichever day this actually is - today with its passed
// items dropped, or the next day with anything at all if today's now empty.
export interface DisplayTodaySummary {
  date: string;
  isToday: boolean;
  chores: Array<{ id: string; title: string; dueTime: string | null; status: string; assignedTo: string }>;
  events: CalEvent[];
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  type: 'CHORE' | 'MANUAL' | 'PHYSICAL' | 'REDEEM' | 'STREAK_BONUS' | 'AWARD';
  refId?: string | null;
  createdAt: string;
  // Adults only - the server omits this entirely for a kid's session.
  createdByName?: string;
}

// Same shape as ImageCropper's CropRect - duplicated here (rather than
// imported) so this file stays free of any React-component dependency.
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StorePrize {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  // Which region of `image` shows on the store card - never applied to the
  // image itself (see Prize model comment). Null/absent = show the whole
  // thing (cover-fit) - same as a prize created before this existed.
  imageCrop?: CropRect | null;
  url?: string | null;
  realPrice?: string | number | null;
  tokenCost: number;
  type: 'ITEM' | 'EVENT';
  scope: 'GLOBAL' | 'SPECIFIC';
  assignedUserIds: string[];
  location?: { id: string; name: string } | null;
  repeatable: boolean;
  archived: boolean;
  createdByName?: string | null;
  suggested: boolean;
  suggestedById?: string | null;
  suggestedByName?: string | null;
}

export interface Redemption {
  id: string;
  prizeId: string;
  userId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  requestedAt: string;
  usedAt?: string | null;
  prize: { name: string; tokenCost: number; type: string };
  user?: { id: string; displayName: string };
  // Adults only - the server omits this entirely for a kid's session.
  approvedByUser?: { id: string; displayName: string } | null;
}

export const BASE_URL = BASE;

// Fired on window whenever a notification's read state changes, so the Nav
// bell badge can refetch immediately instead of waiting for its next poll.
export const NOTIFICATIONS_CHANGED_EVENT = 'rhq:notifications-changed';

// Fired on window whenever opening a notification implies something else
// changed server-side (a new bonus wheel, a redemption's status, etc) - the
// main portal has no SSE stream the way the kiosk does, so without this a
// component that already mounted before the change happened (e.g. ChoresPanel
// sitting open when a wheel got granted) never refetches until an unrelated
// remount or a manual reload. Listeners: ChoresPanel (wheels + chores).
export const DATA_REFRESH_EVENT = 'rhq:data-refresh';
export const displayStreamUrl = `${BASE}/display/stream`;

export const api = {
  me: () => req<Me>('/auth/me'),
  members: () => req<Member[]>('/auth/members'),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  registerLocal: (body: { displayName: string; email?: string; username?: string; password: string; inviteToken?: string }) =>
    req<{ ok: boolean }>('/auth/local/register', { method: 'POST', body: JSON.stringify(body) }),
  loginLocal: (body: { identifier: string; password: string }) =>
    req<{ ok: boolean }>('/auth/local/login', { method: 'POST', body: JSON.stringify(body) }),
  setLocalPassword: (userId: string, password: string, currentPassword?: string) =>
    req<{ ok: boolean }>(`/auth/local/${userId}/password`, { method: 'PUT', body: JSON.stringify({ password, currentPassword }) }),
  updateProfile: (body: Partial<{ displayName: string; username: string | null; email: string | null; avatar: string | null }>) =>
    req<Me>('/auth/me/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  listGoogleAccounts: () => req<GoogleAccountInfo[]>('/auth/google/accounts'),
  disconnectGoogleAccount: (id: string) => req<{ ok: boolean }>(`/auth/google/accounts/${id}`, { method: 'DELETE' }),
  deleteMyAccount: () => req<{ ok: boolean }>('/users/me', { method: 'DELETE' }),
  createLocalMember: (body: { role: 'ADULT' | 'KID'; displayName: string; email?: string; username?: string; password?: string }) =>
    req<Member>('/auth/local/member', { method: 'POST', body: JSON.stringify(body) }),
  forgotPassword: (email: string) =>
    req<{ ok: boolean }>('/auth/local/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    req<{ ok: boolean }>('/auth/local/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

  googleCalendars: () => req<GoogleCalendar[]>('/calendars/google'),
  googleAccountStatus: () => req<{ needsReconnect: boolean }>('/calendars/google/status'),
  sharedCalendars: (kioskToken?: string) => req<SharedCalendar[]>('/calendars', undefined, kioskToken),
  share: (googleAccountId: string, selections: Array<{ googleCalendarId: string; name: string; color?: string }>) =>
    req('/calendars/share', { method: 'POST', body: JSON.stringify({ googleAccountId, selections }) }),
  unshare: (googleCalendarId: string) =>
    req('/calendars/unshare', { method: 'POST', body: JSON.stringify({ googleCalendarId }) }),
  // My own personal override of how a calendar renders for me - null clears
  // it back to the calendar's own color. Works for Google, local, or the
  // Holidays sentinel id, since the server keys this off calendarId alone.
  setCalendarColor: (calendarId: string, color: string | null) =>
    req<{ ok: boolean; color: string | null }>(`/calendars/${calendarId}/color`, { method: 'PUT', body: JSON.stringify({ color }) }),
  // Calendars relevant to my own location(s) only - the personal color
  // picker in My Settings uses this instead of the unrestricted list.
  myCalendars: () => req<SharedCalendar[]>('/calendars/mine'),
  // Owner/family-manager only - the calendar's own shared default color.
  setCalendarBaseColor: (calendarId: string, color: string) =>
    req<{ ok: boolean }>(`/calendars/${calendarId}/base-color`, { method: 'PUT', body: JSON.stringify({ color }) }),
  events: (calendarIds: string[], start: string, end: string) =>
    req<CalEvent[]>(`/calendars/events?calendarIds=${calendarIds.join(',')}&start=${start}&end=${end}`),
  createCalendarEvent: (
    calendarId: string,
    body: EventInput,
    kioskToken?: string,
  ) => req<CalEvent>(`/calendars/${calendarId}/events`, { method: 'POST', body: JSON.stringify(body) }, kioskToken),
  updateCalendarEvent: (calendarId: string, eventId: string, body: Partial<EventInput>, kioskToken?: string) =>
    req<CalEvent>(`/calendars/${calendarId}/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(body) }, kioskToken),
  deleteCalendarEvent: (calendarId: string, eventId: string, kioskToken?: string) =>
    req<{ ok: boolean }>(`/calendars/${calendarId}/events/${eventId}`, { method: 'DELETE' }, kioskToken),

  localCalendars: () => req<SharedCalendar[]>('/local-calendars'),
  createLocalCalendar: (body: LocalCalendarInput) =>
    req<SharedCalendar>('/local-calendars', { method: 'POST', body: JSON.stringify(body) }),
  updateLocalCalendar: (id: string, body: Partial<LocalCalendarInput>) =>
    req<SharedCalendar>(`/local-calendars/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLocalCalendar: (id: string) => req<{ ok: boolean }>(`/local-calendars/${id}`, { method: 'DELETE' }),

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
    onScreenKeyboard?: boolean;
    screensaverMinutes?: number;
    weatherLocation?: string | null;
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
      onScreenKeyboard: boolean;
      screensaverMinutes: number;
      weatherLocation: string | null;
    }>,
  ) => req<DisplayConfig>(`/displays/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDisplay: (id: string) => req(`/displays/${id}`, { method: 'DELETE' }),
  // Pushes a reload to every kiosk currently on this config (or, with no id,
  // every kiosk in the family) over the SSE stream they already hold open -
  // fixes a frozen/stuck Pi without walking over to it. Can't reach a kiosk
  // whose display token was actually revoked; its stream was never connected.
  reloadDisplay: (displayConfigId?: string) =>
    req<{ ok: boolean }>('/displays/reload', { method: 'POST', body: JSON.stringify({ displayConfigId }) }),
  // Calendars selectable for a display: all shared calendars, or (scoped) only
  // those shared by someone assigned to that location.
  displaysCalendars: (locationId?: string | null) =>
    req<SharedCalendar[]>(`/displays/calendars${locationId ? `?locationId=${locationId}` : ''}`),

  listUsers: () => req<Member[]>('/users'),
  setUserPin: (id: string, pin: string | null) =>
    req(`/users/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }),
  // Kid-only master switch: blocks setting a PIN at all, clears any existing one.
  setPinDisabled: (id: string, disabled: boolean) =>
    req<{ ok: boolean; pinDisabled: boolean }>(`/users/${id}/pin-disabled`, { method: 'PUT', body: JSON.stringify({ disabled }) }),
  setUserRole: (id: string, role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID') =>
    req(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  setTokensDisabled: (id: string, disabled: boolean) =>
    req<{ ok: boolean }>(`/users/${id}/tokens-disabled`, { method: 'PUT', body: JSON.stringify({ disabled }) }),
  removeUser: (id: string) => req(`/users/${id}`, { method: 'DELETE' }),
  resetUser: (id: string) => req<{ ok: boolean }>(`/users/${id}/reset`, { method: 'POST' }),
  setTheme: (theme: 'light' | 'dark') =>
    req<{ ok: boolean; theme: string }>('/users/me/theme', { method: 'PUT', body: JSON.stringify({ theme }) }),
  setColorTheme: (colorTheme: string) =>
    req<{ ok: boolean; colorTheme: string }>('/users/me/color-theme', {
      method: 'PUT',
      body: JSON.stringify({ colorTheme }),
    }),
  setFontSize: (fontSize: FontSize) =>
    req<{ ok: boolean; fontSize: string }>('/users/me/font-size', { method: 'PUT', body: JSON.stringify({ fontSize }) }),
  setNotifyByEmail: (notifyByEmail: boolean) =>
    req<{ ok: boolean; notifyByEmail: boolean }>('/users/me/notify-by-email', {
      method: 'PUT',
      body: JSON.stringify({ notifyByEmail }),
    }),
  pendingWheels: () => req<PendingWheel[]>('/wheels/pending'),
  spinWheel: (id: string) => req<{ amount: number; min: number; max: number; reason?: string }>(`/wheels/${id}/spin`, { method: 'POST' }),
  setOwnBirthday: (birthday: string | null) =>
    req<{ ok: boolean; birthday: string | null }>('/users/me/birthday', { method: 'PUT', body: JSON.stringify({ birthday }) }),
  setSoundEffects: (soundEffects: boolean) =>
    req<{ ok: boolean; soundEffects: boolean }>('/users/me/sound-effects', {
      method: 'PUT',
      body: JSON.stringify({ soundEffects }),
    }),
  setMemberPrefs: (userId: string, prefs: { simpleMode?: boolean; allowanceTokens?: number; birthday?: string | null; disabledPermissions?: string[] }) =>
    req<{ ok: boolean }>(`/users/${userId}/prefs`, { method: 'PUT', body: JSON.stringify(prefs) }),
  givenStats: (userId: string, kioskToken?: string) =>
    req<{ tokensGiven: number; awardsGiven: number; approvals: number; rejections: number }>(
      `/users/${userId}/given-stats`,
      undefined,
      kioskToken,
    ),

  // Household widgets (meals / grocery / countdowns / announcements).
  // locationId scopes reads to one household (its items + family-wide ones)
  // and writes to that household; omit for family-wide.
  meals: (start: string, end: string, locationId?: string | null) =>
    req<MealPlanEntry[]>(`/household/meals?start=${start}&end=${end}${locationId ? `&locationId=${locationId}` : ''}`),
  setMeal: (
    date: string,
    body: { title?: string; notes?: string | null; locationId?: string | null; isEatingOut?: boolean; eatOutPlaceId?: string | null },
  ) => req<MealPlanEntry>(`/household/meals/${date}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteMeal: (date: string, locationId?: string | null) =>
    req(`/household/meals/${date}${locationId ? `?locationId=${locationId}` : ''}`, { method: 'DELETE' }),
  spinEatOut: (date: string, locationId?: string | null) =>
    req<MealPlanEntry>(`/household/meals/${date}/spin-out`, { method: 'POST', body: JSON.stringify({ locationId }) }),
  eatOutPlaces: () => req<EatOutPlace[]>('/household/eat-out-places'),
  addEatOutPlace: (name: string, notes?: string) =>
    req<EatOutPlace>('/household/eat-out-places', { method: 'POST', body: JSON.stringify({ name, notes }) }),
  deleteEatOutPlace: (id: string) => req(`/household/eat-out-places/${id}`, { method: 'DELETE' }),
  grocery: (locationId?: string | null) => req<GroceryItem[]>(`/household/grocery${locationId ? `?locationId=${locationId}` : ''}`),
  addGrocery: (label: string, locationId?: string | null) =>
    req<GroceryItem>('/household/grocery', { method: 'POST', body: JSON.stringify({ label, locationId }) }),
  patchGrocery: (id: string, body: { checked?: boolean; label?: string }) =>
    req<GroceryItem>(`/household/grocery/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGrocery: (id: string) => req(`/household/grocery/${id}`, { method: 'DELETE' }),
  clearCheckedGrocery: (locationId?: string | null) =>
    req(`/household/grocery/checked${locationId ? `?locationId=${locationId}` : ''}`, { method: 'DELETE' }),
  countdowns: (locationId?: string | null) =>
    req<CountdownEntry[]>(`/household/countdowns${locationId ? `?locationId=${locationId}` : ''}`),
  addCountdown: (body: { title: string; date: string; emoji?: string; locationId?: string | null }) =>
    req<CountdownEntry>('/household/countdowns', { method: 'POST', body: JSON.stringify(body) }),
  deleteCountdown: (id: string) => req(`/household/countdowns/${id}`, { method: 'DELETE' }),
  announcements: (locationId?: string | null) =>
    req<AnnouncementEntry[]>(`/household/announcements${locationId ? `?locationId=${locationId}` : ''}`),
  addAnnouncement: (body: { text: string; expiresInHours?: number; locationId?: string | null }) =>
    req<AnnouncementEntry>('/household/announcements', { method: 'POST', body: JSON.stringify(body) }),
  deleteAnnouncement: (id: string) => req(`/household/announcements/${id}`, { method: 'DELETE' }),

  pushPublicKey: () => req<{ key: string | null }>('/notifications/push/public-key'),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    req('/notifications/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  unsubscribePush: (endpoint: string) =>
    req('/notifications/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),

  listInvites: () => req<InviteInfo[]>('/invites'),
  createInvite: (role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID', label?: string, familyId?: string) =>
    req<MintedInvite>('/invites', { method: 'POST', body: JSON.stringify({ role, label, familyId }) }),
  revokeInvite: (id: string) => req(`/invites/${id}`, { method: 'DELETE' }),
  // Server builds the link from the request origin; we only say who gets it.
  emailInvite: (token: string, email: string) =>
    req<{ ok: boolean; sentTo: string }>('/invites/email', { method: 'POST', body: JSON.stringify({ token, email }) }),

  listFamilies: () => req<FamilyInfo[]>('/owner/families'),
  createFamily: (name: string) => req<FamilyInfo>('/owner/families', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteFamily: (id: string) => req<{ ok: boolean }>(`/owner/families/${id}`, { method: 'DELETE' }),
  renameFamily: (id: string, name: string) =>
    req<{ id: string; name: string }>(`/owner/families/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  auditLog: () => req<AuditLogEntry[]>('/owner/audit-log'),
  ownerFamilyMembers: (familyId: string) => req<Member[]>(`/owner/families/${familyId}/members`),
  // Instance-owner user controls: lock out (reversible), delete (not), and
  // create an account in any family without an invite.
  ownerSetUserActive: (id: string, active: boolean) =>
    req<{ ok: boolean; active: boolean }>(`/owner/users/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) }),
  ownerDeleteUser: (id: string) => req<{ ok: boolean }>(`/owner/users/${id}`, { method: 'DELETE' }),
  ownerCreateUser: (body: {
    familyId: string;
    role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID';
    displayName: string;
    email?: string;
    username?: string;
    password?: string;
  }) => req<Member>('/owner/users', { method: 'POST', body: JSON.stringify(body) }),
  moveUser: (id: string, familyId: string, role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID') =>
    req<{ ok: boolean }>(`/owner/users/${id}/move`, { method: 'POST', body: JSON.stringify({ familyId, role }) }),
  ghost: (userId: string) => req<{ ok: boolean }>(`/owner/ghost/${userId}`, { method: 'POST' }),
  unghost: () => req<{ ok: boolean }>('/owner/unghost', { method: 'POST' }),

  // Global "Holidays" calendar rule set - owner-only (see HolidaysService).
  listHolidays: () => req<HolidayRule[]>('/holidays'),
  createHoliday: (body: HolidayRuleInput) => req<HolidayRule>('/holidays', { method: 'POST', body: JSON.stringify(body) }),
  updateHoliday: (id: string, body: Partial<HolidayRuleInput>) =>
    req<HolidayRule>(`/holidays/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteHoliday: (id: string) => req<{ ok: boolean }>(`/holidays/${id}`, { method: 'DELETE' }),

  familySettings: (kioskToken?: string) => req<FamilySettings>('/family/settings', undefined, kioskToken),
  updateFamilySettings: (data: { name?: string; tokenName?: string; tokenIcon?: string; tokenValueUsd?: number; choreWord?: string; disabledFeatures?: string[] }) =>
    req<FamilySettings>('/family/settings', { method: 'PUT', body: JSON.stringify(data) }),

  tokenBalances: () => req<Array<{ userId: string; balance: number }>>('/tokens/balances'),
  tokenBalance: (userId?: string, kioskToken?: string) =>
    req<{ userId: string; balance: number }>(`/tokens/balance${userId ? `?userId=${userId}` : ''}`, undefined, kioskToken),
  tokenLedger: (userId?: string, kioskToken?: string) =>
    req<LedgerEntry[]>(`/tokens/ledger${userId ? `?userId=${userId}` : ''}`, undefined, kioskToken),
  adjustTokens: (body: { userId: string; delta: number; reason: string; type?: 'MANUAL' | 'PHYSICAL' }) =>
    req<LedgerEntry>('/tokens/adjust', { method: 'POST', body: JSON.stringify(body) }),
  deleteLedgerEntry: (id: string) => req(`/tokens/ledger/${id}`, { method: 'DELETE' }),

  locations: (kioskToken?: string) => req<FamilyLocation[]>('/locations', undefined, kioskToken),
  createLocation: (name: string) => req<FamilyLocation>('/locations', { method: 'POST', body: JSON.stringify({ name }) }),
  updateLocation: (id: string, body: { name?: string; timezone?: string }) =>
    req<FamilyLocation>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLocation: (id: string) => req(`/locations/${id}`, { method: 'DELETE' }),
  assignLocation: (id: string, userId: string) =>
    req(`/locations/${id}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
  unassignLocation: (id: string, userId: string) => req(`/locations/${id}/users/${userId}`, { method: 'DELETE' }),

  prizes: () => req<StorePrize[]>('/prizes'),
  createPrize: (body: Record<string, unknown>, kioskToken?: string) =>
    req<StorePrize>('/prizes', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
  suggestPrize: (body: { name: string; description?: string; image?: string; url?: string }) =>
    req<StorePrize>('/prizes/suggest', { method: 'POST', body: JSON.stringify(body) }),
  updatePrize: (id: string, body: Record<string, unknown>, kioskToken?: string) =>
    req<StorePrize>(`/prizes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, kioskToken),
  deletePrize: (id: string) => req(`/prizes/${id}`, { method: 'DELETE' }),
  redeemPrize: (id: string) => req(`/prizes/${id}/redeem`, { method: 'POST' }),
  redemptions: (opts: { userId?: string; prizeId?: string } = {}) => {
    const sp = new URLSearchParams();
    if (opts.userId) sp.set('userId', opts.userId);
    if (opts.prizeId) sp.set('prizeId', opts.prizeId);
    const qs = sp.toString();
    return req<Redemption[]>(`/prizes/redemptions${qs ? `?${qs}` : ''}`);
  },
  fulfillRedemption: (id: string) => req(`/prizes/redemptions/${id}/fulfill`, { method: 'POST' }),
  rejectRedemption: (id: string) => req(`/prizes/redemptions/${id}/reject`, { method: 'POST' }),
  search: (q: string, kioskToken?: string) => req<SearchResult>(`/search?q=${encodeURIComponent(q)}`, undefined, kioskToken),
  markRedemptionUsed: (id: string, used: boolean) =>
    req(`/prizes/redemptions/${id}/used`, { method: 'PATCH', body: JSON.stringify({ used }) }),

  chores: () => req<Chore[]>('/chores'),
  balances: () => req<Balance[]>('/chores/balances'),
  // Adults-only full activity log (no per-chore cap, unlike the main list) -
  // omit choreId for everything, or pass it to drill into one chore.
  choreHistory: (choreId?: string) => req<ChoreHistoryEntry[]>(`/chores/history${choreId ? `?choreId=${choreId}` : ''}`),
  // Owner/family-manager only - server 403s anyone else.
  choreAudit: (choreId: string) => req<ChoreAuditEntry[]>(`/chores/${choreId}/audit`),
  createChore: (body: Record<string, unknown>) =>
    req<Chore>('/chores', { method: 'POST', body: JSON.stringify(body) }),
  checkItem: (instanceId: string, checklistId: string, checked: boolean) =>
    req(`/chores/instances/${instanceId}/check`, { method: 'POST', body: JSON.stringify({ checklistId, checked }) }),
  completeInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/complete`, { method: 'POST' }),
  skipInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/skip`, { method: 'POST' }),
  unskipInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/unskip`, { method: 'POST' }),
  attachProof: (instanceId: string, image: string) =>
    req(`/chores/instances/${instanceId}/proof`, { method: 'POST', body: JSON.stringify({ image }) }),
  proofImage: (instanceId: string) => req<{ image: string | null }>(`/chores/instances/${instanceId}/proof`),
  approveInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/approve`, { method: 'POST' }),
  rejectInstance: (instanceId: string) =>
    req(`/chores/instances/${instanceId}/reject`, { method: 'POST' }),

  // all=true -> family-wide activity feed (adults only, enforced server-side).
  notifications: (all = false) => req<AppNotification[]>(`/notifications${all ? '?all=1' : ''}`),
  unreadNotificationCount: () => req<{ count: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) => req(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => req('/notifications/read-all', { method: 'POST' }),

  // kioskToken lets a kid pull this up on the kiosk itself, not just their
  // own phone/tablet - read-only for them either way (server-scoped to
  // shared + their own targeted rules; see rules.service.ts's list()).
  rules: (kioskToken?: string) => req<Rule[]>('/rules', undefined, kioskToken),
  createRule: (body: { text: string; targetUserId?: string | null }, kioskToken?: string) =>
    req<Rule>('/rules', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
  updateRule: (id: string, body: Partial<{ text: string; targetUserId: string | null }>, kioskToken?: string) =>
    req<Rule>(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, kioskToken),
  deleteRule: (id: string, kioskToken?: string) => req(`/rules/${id}`, { method: 'DELETE' }, kioskToken),

  awardsCatalog: (kioskToken?: string) => req<AwardCatalogItem[]>('/awards', undefined, kioskToken),
  earnedAwards: (userId?: string, kioskToken?: string) =>
    req<EarnedAward[]>(`/awards/earned${userId ? `?userId=${userId}` : ''}`, undefined, kioskToken),
  awardHistory: () => req<AwardGrantHistoryItem[]>('/awards/history'),
  createAward: (body: { name: string; icon?: string; description?: string; defaultTokenValue?: number; wheelMin?: number; wheelMax?: number }, kioskToken?: string) =>
    req<AwardCatalogItem>('/awards', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
  updateAward: (
    id: string,
    body: Partial<{ name: string; icon: string; description: string; defaultTokenValue: number; wheelMin: number; wheelMax: number }>,
    kioskToken?: string,
  ) => req<AwardCatalogItem>(`/awards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, kioskToken),
  deleteAward: (id: string) => req(`/awards/${id}`, { method: 'DELETE' }),
  grantAward: (id: string, body: { userId: string; note?: string; tokenValue?: number; wheelMin?: number; wheelMax?: number }, kioskToken?: string) =>
    req<{ wheelQueued?: boolean }>(`/awards/${id}/grant`, { method: 'POST', body: JSON.stringify(body) }, kioskToken),
  // What removing a grant would claw back, split by source, so the confirm
  // dialog can name the actual numbers instead of guessing.
  awardGrantImpact: (grantId: string) =>
    req<{ award: number; wheel: number; total: number }>(`/awards/grants/${grantId}/impact`),
  removeAwardGrant: (grantId: string, removeTokens = true) =>
    req(`/awards/grants/${grantId}?removeTokens=${removeTokens ? '1' : '0'}`, { method: 'DELETE' }),
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
    // Kid backing out of their own still-open claim - the adult-only
    // assignInstance below can reassign anyone's claim any time instead.
    unclaimInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/unclaim`, { method: 'POST' }, kioskToken),
    assignInstance: (instanceId: string, userId: string | null) =>
      req(`/chores/instances/${instanceId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }, kioskToken),
    checkItem: (instanceId: string, checklistId: string, checked: boolean) =>
      req(`/chores/instances/${instanceId}/check`, { method: 'POST', body: JSON.stringify({ checklistId, checked }) }, kioskToken),
    completeInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/complete`, { method: 'POST' }, kioskToken),
    skipInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/skip`, { method: 'POST' }, kioskToken),
    unskipInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/unskip`, { method: 'POST' }, kioskToken),
    attachProof: (instanceId: string, image: string) =>
      req(`/chores/instances/${instanceId}/proof`, { method: 'POST', body: JSON.stringify({ image }) }, kioskToken),
    proofImage: (instanceId: string) => req<{ image: string | null }>(`/chores/instances/${instanceId}/proof`, undefined, kioskToken),
    pendingWheels: () => req<PendingWheel[]>('/wheels/pending', undefined, kioskToken),
    spinWheel: (id: string) =>
      req<{ amount: number; min: number; max: number; reason?: string }>(`/wheels/${id}/spin`, { method: 'POST' }, kioskToken),
    approveInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/approve`, { method: 'POST' }, kioskToken),
    rejectInstance: (instanceId: string) =>
      req(`/chores/instances/${instanceId}/reject`, { method: 'POST' }, kioskToken),
  };
}

export type ChoreClient = ReturnType<typeof choreClient>;

// Prize/redeem operations bound to the same auth context as choreClient -
// lets a kid browse and redeem prizes from the kiosk (adding/editing prizes
// stays admin-portal-only, so there's no create/update/delete here).
export function prizeClient(kioskToken?: string) {
  return {
    prizes: () => req<StorePrize[]>('/prizes', undefined, kioskToken),
    redeemPrize: (id: string) => req<Redemption>(`/prizes/${id}/redeem`, { method: 'POST' }, kioskToken),
    tokenBalance: (userId?: string) =>
      req<{ userId: string; balance: number }>(`/tokens/balance${userId ? `?userId=${userId}` : ''}`, undefined, kioskToken),
    familySettings: () => req<FamilySettings>('/family/settings', undefined, kioskToken),
    redemptions: (userId: string) => req<Redemption[]>(`/prizes/redemptions?userId=${userId}`, undefined, kioskToken),
    suggestPrize: (body: { name: string; description?: string; image?: string; url?: string }) =>
      req<StorePrize>('/prizes/suggest', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
    // Family-wide, not scoped to one person - for the kiosk's adult-only
    // "pending approvals" panel. Filter to status REQUESTED client-side.
    allRedemptions: () => req<Redemption[]>('/prizes/redemptions', undefined, kioskToken),
    fulfillRedemption: (id: string) => req(`/prizes/redemptions/${id}/fulfill`, { method: 'POST' }, kioskToken),
    rejectRedemption: (id: string) => req(`/prizes/redemptions/${id}/reject`, { method: 'POST' }, kioskToken),
    adjustTokens: (body: { userId: string; delta: number; reason: string; type?: 'MANUAL' | 'PHYSICAL' }) =>
      req<LedgerEntry>('/tokens/adjust', { method: 'POST', body: JSON.stringify(body) }, kioskToken),
    commonReasons: () => req<string[]>('/tokens/reasons', undefined, kioskToken),
    awardsCatalog: () => req<AwardCatalogItem[]>('/awards', undefined, kioskToken),
    grantAward: (id: string, body: { userId: string; note?: string; tokenValue?: number; wheelMin?: number; wheelMax?: number }) =>
      req(`/awards/${id}/grant`, { method: 'POST', body: JSON.stringify(body) }, kioskToken),
    listUsers: () => req<Member[]>('/users', undefined, kioskToken),
    setPin: (userId: string, pin: string | null) =>
      req(`/users/${userId}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }, kioskToken),
    setColorTheme: (colorTheme: string) =>
      req<{ ok: boolean; colorTheme: string }>(
        '/users/me/color-theme',
        { method: 'PUT', body: JSON.stringify({ colorTheme }) },
        kioskToken,
      ),
  };
}

export type PrizeClient = ReturnType<typeof prizeClient>;
