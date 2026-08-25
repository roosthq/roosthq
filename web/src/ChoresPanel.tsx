import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  choreClient,
  prizeClient,
  pluralize,
  DATA_REFRESH_EVENT,
  type Chore,
  type Member,
  type Balance,
  type ChoreClient,
  type FamilyLocation,
  type PendingWheel,
} from './api';
import { celebrate } from './celebrate';
import ProofButton from './ProofButton';
import RewardRevealModal from './RewardRevealModal';
import { STARTER_PACKS } from './starterPacks';
import PendingPanel from './PendingPanel';
import TokenBadge from './TokenBadge';
import LucideIcon from './LucideIcon';
import { useDialog } from './Dialog';
import Modal from './Modal';
import { myLocationIds } from './displayScope';
import { addDaysToKey, dateKeyInZone, endOfDayInZone, startOfDayInZone, todayKeyInZone } from './timezone';

// How many days ahead the 'today' sidebar looks for "coming up" items and
// anything open to claim early (claiming ahead is allowed server-side;
// completing isn't, until it's actually due).
const UPCOMING_DAYS = 3;

// Last household picked in the chore form - new chores start there.
const LAST_CHORE_LOCATION_KEY = 'roosthq.lastChoreLocationId';

// Pending wheels store a full reason like "Bonus wheel: Homework (5 in a
// row)"; the UI only wants the part that says what earned it.
function wheelSource(w: { reason: string }): string {
  return w.reason.replace(/^Bonus wheel:\s*/, '');
}

const REPEAT_OPTIONS: Array<{ value: string; label: string; help: string }> = [
  { value: '', label: 'One time', help: 'Happens once and is done.' },
  { value: 'DAILY', label: 'Every day', help: 'Can be done once each day.' },
  { value: 'WEEKLY', label: 'Weekly', help: 'Once a week on the chosen day.' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks', help: 'Every other week on the chosen day.' },
  { value: 'MONTHLY', label: 'Monthly', help: 'Once a month.' },
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const REPEAT_LABEL: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every 2 weeks',
  MONTHLY: 'Monthly',
};

function resolveDaysOfWeek(chore: { daysOfWeek?: number[] | null; dayOfWeek?: number | null }): number[] {
  if (chore.daysOfWeek?.length) return chore.daysOfWeek;
  return chore.dayOfWeek != null ? [chore.dayOfWeek] : [];
}

// Client-side mirror of the server's anyModeWindow (chores.service.ts) -
// which selected weekday is the window's FIRST day vs. its LAST, treating
// the set as a circle (Sun wraps to Sat) so [Sat, Sun] gets a sane 2-day
// window instead of stretching across most of the week. Found by locating
// the single biggest gap between consecutive selected days on that circle.
function anyModeWindow(daysOfWeek: number[]): { firstDow: number; lastDow: number } {
  const sorted = [...new Set(daysOfWeek)].sort((a, b) => a - b);
  if (sorted.length <= 1) return { firstDow: sorted[0] ?? 0, lastDow: sorted[0] ?? 0 };
  let bestGap = -1;
  let firstDow = sorted[0];
  let lastDow = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const gap = (next - cur + 7) % 7;
    if (gap > bestGap) {
      bestGap = gap;
      lastDow = cur;
      firstDow = next;
    }
  }
  return { firstDow, lastDow };
}

// The instant a chore instance actually becomes actionable - its own due
// date for EACH mode/single-day chores (unchanged), or the FIRST day of the
// window for an ANY-mode multi-day one ("Mon OR Tue OR Wed" opens Monday,
// not just Wednesday). Mirrors the server's windowStartKey exactly so the
// client's own "is this due yet" checks (dueOpen/dueNow below) agree with
// what the server will actually allow completing.
function availableFromInstant(chore: { daysOfWeek?: number[] | null; dayOfWeek?: number | null; daysOfWeekMode?: string }, dueDateStr: string, tz: string): Date {
  const daysOfWeek = resolveDaysOfWeek(chore);
  if (chore.daysOfWeekMode !== 'ANY' || daysOfWeek.length <= 1) return new Date(dueDateStr);
  const { firstDow, lastDow } = anyModeWindow(daysOfWeek);
  const spanBack = (lastDow - firstDow + 7) % 7;
  const dueKey = dateKeyInZone(new Date(dueDateStr), tz);
  return startOfDayInZone(addDaysToKey(dueKey, -spanBack), tz);
}

// Client-side mirror of the server's nextDue() - purely for display, so a
// repeating chore that's due today still tells a kid it's coming back rather
// than looking like a one-off (no "Next: ..." line shows once it's due now).
function nextOccurrence(rule: string, fromDueDate: string, daysOfWeek: number[], daysOfWeekMode?: string): Date {
  const d = new Date(fromDueDate);
  // ANY mode: fromDueDate already sits on the window's own last selected
  // day, so the next window (same rule interval later) lands on that same
  // weekday again - falls through to the flat +7/+14 below, same as the
  // server's nextDue().
  if (daysOfWeek.length > 1 && daysOfWeekMode !== 'ANY') {
    const fromDow = d.getDay();
    let best = 7;
    for (const dow of daysOfWeek) {
      let offset = (dow - fromDow + 7) % 7;
      if (offset === 0) offset = 7;
      if (offset < best) best = offset;
    }
    d.setDate(d.getDate() + (best === 7 ? 0 : best));
    return d;
  }
  switch (rule) {
    case 'DAILY':
      d.setDate(d.getDate() + 1);
      return d;
    case 'WEEKLY':
      d.setDate(d.getDate() + 7);
      return d;
    case 'BIWEEKLY':
      d.setDate(d.getDate() + 14);
      return d;
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1);
      return d;
    default:
      return d;
  }
}

function formatDueTime(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function relativeDayLabel(d: Date): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'again tomorrow';
  return `again ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

type Actor = { id: string; role: string; displayName: string };

export default function ChoresPanel({
  me,
  client: clientProp,
  variant = 'full',
  locationId,
  refreshSignal,
  showPending = false,
}: {
  me: Actor;
  client?: ChoreClient;
  variant?: 'full' | 'today';
  // Adults get the "waiting on a yes/no" inbox pinned above the list - the
  // main portal turns this on; the kiosk already renders PendingPanel in its
  // own layout slot, so it stays off there to avoid doubling up.
  showPending?: boolean;
  // Scope to one location's chores (plus location-less/"global" ones) - used on
  // the kiosk display, which represents whoever lives at a given location, not
  // the whole family. Omit entirely for the normal portal (unscoped).
  locationId?: string | null;
  // Bump this (e.g. on an incoming live-update push) to force an immediate
  // refetch from outside - the kiosk uses this so a chore claimed/finished on
  // someone else's phone shows up here without a page reload.
  refreshSignal?: number;
}) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const isTopManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const { alert, confirm } = useDialog();
  const today = variant === 'today';
  const [personFilter, setPersonFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  // Prefilled from ?q= when arriving via the global Search page - read directly
  // off window.location rather than react-router's useSearchParams, since this
  // component is also mounted by the kiosk (Display.tsx), which runs outside
  // any <BrowserRouter> and would crash on that hook.
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(
    () => (localStorage.getItem('rhq-chores-view') as 'cards' | 'table') || 'cards',
  );
  useEffect(() => {
    localStorage.setItem('rhq-chores-view', viewMode);
  }, [viewMode]);
  // A 7-column table can't work at phone width - every cell wraps to four
  // lines. Below sm we always render cards and hide the layout toggle; the
  // saved preference is untouched, so a tablet/desktop still gets its table.
  const [narrow, setNarrow] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveView = narrow ? 'cards' : viewMode;
  const [sort, setSort] = useState<{ key: 'title' | 'location' | 'assigned' | 'due' | 'tokens' | 'status'; dir: 1 | -1 }>({
    key: 'due',
    dir: 1,
  });
  // clientProp is a fresh object on every parent render when the caller doesn't
  // memoize it (e.g. Display.tsx); memoize here so `refresh` below stays stable
  // instead of re-firing its effect on every render.
  const client = useMemo(() => clientProp ?? choreClient(), [clientProp]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [householdTab, setHouseholdTab] = useState('');
  const [tokenName, setTokenName] = useState('Tokens');
  const [tokenIcon, setTokenIcon] = useState('coins'); // Lucide name - see App.tsx tokenIcon comment
  const [choreWord, setChoreWord] = useState('Chore');
  const [formOpen, setFormOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  // Wheels this person has earned and not yet spun. Shown as a big call-to-
  // action; spinning happens on THEIR screen (phone, tablet, or kiosk).
  const [pendingWheels, setPendingWheels] = useState<PendingWheel[]>([]);
  const [wheel, setWheel] = useState<PendingWheel | null>(null);
  const refreshWheels = useCallback(() => {
    client.pendingWheels().then(setPendingWheels).catch(() => setPendingWheels([]));
  }, [client]);
  useEffect(() => {
    refreshWheels();
  }, [refreshWheels, refreshSignal]);
  // `editing` seeds the form's fields (edit OR duplicate); `editingId` is the
  // one that decides whether submit PATCHes that chore or POSTs a new one -
  // duplicate sets `editing` but leaves `editingId` null, so it prefills from
  // the source chore but always creates a fresh row.
  const [editing, setEditing] = useState<Chore | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const chorePlural = pluralize(choreWord);

  const refresh = useCallback(async () => {
    const [c, b, m, l] = await Promise.all([
      client.chores(),
      client.balances(),
      client.members().catch(() => []),
      client.locations().catch(() => []),
    ]);
    setChores(c);
    setBalances(b);
    setMembers(m);
    setLocations(l);
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable per client; only refreshSignal should re-trigger this
  useEffect(() => {
    if (refreshSignal !== undefined) refresh();
  }, [refreshSignal]);

  // The kiosk gets live updates over its own SSE stream (refreshSignal
  // above); the main portal has no such stream, so a chore/wheel granted
  // while this was already mounted (e.g. opening a notification that leads
  // back to a page already open in another tab) would otherwise sit stale
  // until an unrelated remount or a manual reload.
  useEffect(() => {
    const onDataRefresh = () => {
      refresh();
      refreshWheels();
    };
    window.addEventListener(DATA_REFRESH_EVENT, onDataRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onDataRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh/refreshWheels are stable per client
  }, []);

  useEffect(() => {
    client.familySettings().then((s) => {
      setTokenName(s.tokenName);
      setTokenIcon(s.tokenIcon);
      setChoreWord(s.choreWord);
    }).catch(() => undefined);
  }, [client]);

  const myBalance = balances.find((b) => b.userId === me.id)?.balance ?? 0;
  const myTokensOff = !!members.find((m) => m.id === me.id)?.tokensDisabled;
  // "My Day" pre-reader mode: bigger text and tap targets wherever this
  // person sees their own list - their phone as well as the kiosk.
  const simple = !!members.find((m) => m.id === me.id)?.simpleMode;

  // Kids and plain adults with more than one household get tabs to filter
  // between them (or "All") - the server already limits them to their own
  // households' chores (plus unscoped ones, plus anything actually assigned
  // to them), this is just the client-side split of that same set, one
  // household at a time. Owner/family manager see every household's chores
  // regardless of their own location, so they get a plain dropdown instead
  // (a tab per household they don't necessarily belong to would be odd).
  const myHouseholdIds = useMemo(() => new Set(myLocationIds(locations, me.id)), [locations, me.id]);
  const myHouseholds = isTopManager ? [] : locations.filter((l) => myHouseholdIds.has(l.id));
  const showHouseholdTabs = !today && !locationId && !isTopManager && myHouseholds.length > 1;
  const showLocationDropdown = !today && !locationId && isTopManager && locations.length > 0;

  const searchedChores = useMemo(
    () => (searchQuery.trim() ? chores.filter((c) => c.title.toLowerCase().includes(searchQuery.trim().toLowerCase())) : chores),
    [chores, searchQuery],
  );

  // A chore with no location is "global" (visible everywhere); one with a
  // location only shows when that's the active scope. Picking "All
  // households" (or having just one) drops this filter entirely - that's
  // still where anything assigned to you at a household you're not in shows
  // up (the server includes it; a single household tab intentionally won't).
  const activeLocationId = locationId ?? (showHouseholdTabs ? householdTab : '');
  const householdScoped = activeLocationId
    ? searchedChores.filter((c) => !c.location || c.location.id === activeLocationId)
    : searchedChores;
  const scopedChores =
    showLocationDropdown && locationFilter
      ? householdScoped.filter((c) => (locationFilter === 'NONE' ? !c.location : c.location?.id === locationFilter))
      : householdScoped;

  // Pick the actionable occurrence per chore: a pending one, else the earliest
  // one due now, else the soonest upcoming (so "Enable again" surfaces its new
  // one). In 'today' mode, keep: mine and due-or-coming-up-soon, anything open
  // to claim soon (claiming ahead is allowed server-side even though
  // completing isn't), or pending approval (mine, or - for adults - anyone's).
  // "Due today"/"due soon" for a chore has to mean today in ITS OWN
  // location's timezone, not whatever timezone the viewing device's clock
  // happens to be set to - a kiosk (or phone) even one zone off from its own
  // household silently dropped still-due-today chores right around the real
  // day boundary, with no visible error, just an assigned chore vanishing.
  // Falls back to the first family location (in practice, almost always the
  // only real timezone that applies) for a family-wide chore with no
  // location of its own, and only to the viewing device's own clock if the
  // family has no location at all set up yet.
  const fallbackTimezone = locations[0]?.timezone;

  // #9 - away/vacation blocks claiming/completing/skipping outright. HOME
  // somewhere else blocks too, but "somewhere else" means different things
  // in different contexts: on a KIOSK (locationId prop passed, even if
  // null for an unscoped one) it's whether they're at THIS KIOSK's own
  // house - so even a family-wide (no-location) chore is blocked from a
  // kiosk they're not physically at. In the main app (no locationId prop -
  // there's no kiosk to be "not at") it falls back to the chore's OWN
  // location, so a family-wide chore stays doable from anywhere. No
  // presence set at all (never touched the feature) never blocks - same
  // "no signal" rule the server itself uses. Grayed out, no tooltip, no
  // dialog - the presence badge/kiosk banner elsewhere is the explanation.
  // Declared BEFORE `rows` below - it's read inside that same map(), and a
  // `const` used before its own declaration line throws (TDZ), even though
  // the function calling it is hoisted.
  const myPresence = members.find((m) => m.id === me.id);
  function presenceBlocksChore(chore: Chore): boolean {
    if (!myPresence?.presenceStatus) return false;
    if (myPresence.presenceStatus !== 'HOME') return true;
    const requiredLocationId = locationId !== undefined ? locationId : chore.location?.id ?? null;
    return !!(requiredLocationId && myPresence.presenceLocationId && myPresence.presenceLocationId !== requiredLocationId);
  }

  // Same idea but not tied to any one chore - the wheel isn't scoped to a
  // household on its own, but on a kiosk it's still "are they at THIS
  // house" (locationId prop); in the main app there's no location to
  // compare against, so only away/vacation applies there.
  const presenceBlocksAnything = (() => {
    if (!myPresence?.presenceStatus) return false;
    if (myPresence.presenceStatus !== 'HOME') return true;
    return !!(locationId && myPresence.presenceLocationId && myPresence.presenceLocationId !== locationId);
  })();

  const rows = scopedChores
    .map((chore) => {
      const tz = chore.location?.timezone || fallbackTimezone;
      let endOfToday: Date;
      let endOfWindow: Date;
      if (tz) {
        const todayKey = todayKeyInZone(tz);
        endOfToday = endOfDayInZone(todayKey, tz);
        endOfWindow = endOfDayInZone(addDaysToKey(todayKey, UPCOMING_DAYS), tz);
      } else {
        endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        endOfWindow = new Date(endOfToday);
        endOfWindow.setDate(endOfWindow.getDate() + UPCOMING_DAYS);
      }

      const insts = chore.instances;
      const pending = insts.find((i) => i.status === 'PENDING');
      // "Due open"/"due now" both mean "is this actionable yet" - for an
      // ANY-mode window that's the window's FIRST day, not its dueDate
      // (the LAST day) - see availableFromInstant.
      const dueOpen = insts
        .filter((i) => i.status === 'OPEN' && availableFromInstant(chore, i.dueDate, tz) <= endOfToday)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const upcoming = insts
        .filter((i) => i.status === 'OPEN')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const active = pending ?? dueOpen ?? upcoming ?? insts[0];
      const claimedBy = active?.claimedByUserId;
      const checked = new Set(active?.checks.map((c) => c.checklistId) ?? []);
      const mine = canAct(chore, claimedBy);
      const dueNow = active ? availableFromInstant(chore, active.dueDate, tz) <= endOfToday : false;
      const dueSoon = active ? new Date(active.dueDate) <= endOfWindow : false; // includes dueNow
      const openToClaim = chore.assignmentType === 'ANYONE' && !claimedBy && active?.status === 'OPEN' && dueSoon;
      const relevantToday =
        (mine && active?.status === 'OPEN' && dueSoon) ||
        openToClaim ||
        (active?.status === 'PENDING' && (mine || isAdult));
      // What a kid should see at all: something they can actually do right
      // now, something waiting on an adult, or a skip they might undo.
      // Anything already approved today, or not due until later, drops off
      // their list until it comes round again (or an adult re-enables it).
      const actionableNow =
        (active?.status === 'OPEN' && dueNow && (mine || openToClaim)) ||
        (active?.status === 'PENDING' && mine) ||
        (active?.status === 'SKIPPED' && mine);
      return { chore, active, claimedBy, checked, mine, dueNow, openToClaim, relevantToday, actionableNow, presenceBlocked: presenceBlocksChore(chore) };
    })
    .filter((r) => (!today || r.relevantToday) && (isAdult || r.actionableNow));

  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'member';

  function assignmentLabel(chore: Chore, claimedBy?: string | null) {
    if (chore.assignmentType === 'ANYONE') {
      return claimedBy ? `Claimed by ${memberName(claimedBy)}` : 'Open to anyone';
    }
    return chore.assignees.map((a) => a.user.displayName).join(', ') || 'Unassigned';
  }

  function canAct(chore: Chore, claimedBy?: string | null) {
    if (chore.assignmentType === 'ANYONE') return claimedBy === me.id;
    return chore.assignees.some((a) => a.userId === me.id);
  }

  // Skipping forfeits the reward, so make sure that's the intent - kids read
  // "Skip" as "later", not as "I'm not doing this".
  async function confirmSkip(): Promise<boolean> {
    return confirm(
      `Skip this ${choreWord.toLowerCase()} for today? It counts as not doing it, so no ${tokenName} are earned. It won't break a streak.`,
      { confirmLabel: 'Yes, skip it' },
    );
  }

  async function act(
    fn: () => Promise<unknown>,
    celebrateFrom?: HTMLElement,
    slot: string | ((result: unknown) => string) = 'notification',
  ) {
    try {
      const result = await fn();
      if (celebrateFrom) celebrate(celebrateFrom, typeof slot === 'function' ? slot(result) : slot);
      // A milestone may have queued a wheel for whoever did the chore - it
      // shows up as the banner below for them to spin themselves.
      refreshWheels();
      // This panel refreshes itself via the plain `await refresh()` below
      // regardless - this is for everyone ELSE: ChoreHistoryPanel sitting
      // open on the same page, a pending-approvals indicator, this same
      // page open in another tab. Found the hard way: an adult approved a
      // chore, then immediately checked the (already-open) history panel
      // and saw nothing, because nothing had ever told it anything changed.
      window.dispatchEvent(new Event(DATA_REFRESH_EVENT));
    } catch (e) {
      await alert((e as Error).message || 'Something went wrong');
    }
    await refresh();
  }

  // Approve response carries milestoneHit (chores.service.ts) so the
  // approver's own tap plays the distinct streak-milestone sound instead of
  // the plain "chore approved" one when this approval also hit a streak goal.
  const approveSlot = (r: unknown) => ((r as { milestoneHit?: boolean } | undefined)?.milestoneHit ? 'streakMilestone' : 'choreApproved');

  type Row = (typeof rows)[number];

  // Table view's sort - same `rows` the card view groups by person, just
  // flattened and ordered instead of bucketed, so switching views never
  // changes which chores are visible, only how they're arranged.
  const sortedRows = [...rows].sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    switch (sort.key) {
      case 'title':
        av = a.chore.title.toLowerCase();
        bv = b.chore.title.toLowerCase();
        break;
      case 'location':
        av = a.chore.location?.name.toLowerCase() ?? '';
        bv = b.chore.location?.name.toLowerCase() ?? '';
        break;
      case 'assigned':
        av = assignmentLabel(a.chore, a.claimedBy).toLowerCase();
        bv = assignmentLabel(b.chore, b.claimedBy).toLowerCase();
        break;
      case 'due':
        av = a.active?.dueDate ?? '';
        bv = b.active?.dueDate ?? '';
        break;
      case 'tokens':
        av = a.chore.tokenValue;
        bv = b.chore.tokenValue;
        break;
      case 'status':
        av = a.active?.status ?? '';
        bv = b.active?.status ?? '';
        break;
    }
    if (av < bv) return -sort.dir;
    if (av > bv) return sort.dir;
    return 0;
  });

  function toggleSort(key: typeof sort.key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  // Kiosk ("today") order: whichever chore is already assigned to you beats
  // one you've claimed but isn't formally yours, which beats one still open
  // for anyone to claim, which beats everything else (an adult's view of
  // someone else's pending approval, mainly). Ties within a bucket break by
  // due time so nothing due sooner hides behind something due later.
  function kioskPriority(r: Row): number {
    if (r.mine && r.chore.assignmentType !== 'ANYONE') return 0; // assigned to me
    if (r.mine) return 1; // an ANYONE chore I already claimed
    if (r.openToClaim) return 2; // ANYONE chore still up for grabs
    return 3;
  }
  const todayRows = today
    ? [...rows].sort((a, b) => {
        const diff = kioskPriority(a) - kioskPriority(b);
        return diff !== 0 ? diff : (a.active?.dueDate ?? '').localeCompare(b.active?.dueDate ?? '');
      })
    : rows;

  // Adults get the full roster grouped by person, so they can see who has
  // what at a glance. A kid only ever gets their own group - a kid isn't
  // meant to browse siblings' assignments, just what's theirs to do plus
  // whatever's open to claim. A chore with multiple assignees shows up under
  // each of them (or just this kid, if that's the only one they can see).
  // Kids get a "Today" bucket pinned first - the stuff they can actually do
  // right now - so the answer to "what do I have to do?" is the top of the
  // page, not a scan of every group. Adults keep the plain by-person layout
  // (they're managing everyone, not hunting their own list).
  // Same priority as the kiosk's own "today" order (kioskPriority above):
  // directly assigned to them beats an ANYONE chore they've already claimed,
  // which beats one still open for anyone to grab. This bucket mixes both
  // kinds (a kid's "what do I have to do" view), so without this it fell
  // back to whatever order the chores array happened to arrive in.
  const kidTodayRows =
    !today && !isAdult
      ? rows
          .filter((r) => r.dueNow && r.active?.status === 'OPEN' && (r.mine || r.openToClaim))
          .sort((a, b) => {
            const diff = kioskPriority(a) - kioskPriority(b);
            return diff !== 0 ? diff : (a.active?.dueDate ?? '').localeCompare(b.active?.dueDate ?? '');
          })
      : [];
  const kidTodayIds = new Set(kidTodayRows.map((r) => r.chore.id));

  const groups = today
    ? []
    : [
        {
          key: 'TODAY',
          label: (
            <span className="inline-flex items-center gap-1">
              <LucideIcon name="star" slot="chores.today" size={14} /> Today
            </span>
          ),
          rows: kidTodayRows,
        },
        ...(isAdult ? members : members.filter((m) => m.id === me.id)).map((m) => ({
          key: m.id,
          label: m.displayName,
          rows: rows.filter(
            (r) =>
              !kidTodayIds.has(r.chore.id) &&
              r.chore.assignmentType === 'SPECIFIC' &&
              r.chore.assignees.some((a) => a.userId === m.id),
          ),
        })),
        {
          key: 'ANYONE',
          label: 'Open to anyone',
          rows: rows.filter((r) => !kidTodayIds.has(r.chore.id) && r.chore.assignmentType === 'ANYONE'),
        },
      ]
        .filter((g) => g.rows.length > 0)
        .filter((g) => !personFilter || g.key === personFilter);

  function renderRow({ chore, active, claimedBy, checked, mine, dueNow, openToClaim, presenceBlocked }: Row) {
    const daysOfWeek = resolveDaysOfWeek(chore);
    const next = active && chore.recurrenceRule ? nextOccurrence(chore.recurrenceRule, active.dueDate, daysOfWeek, chore.daysOfWeekMode) : null;
    return (
      <li key={chore.id} className={today ? 'rounded-lg border bg-white p-3 shadow-sm' : 'rounded-xl border bg-white p-4 shadow-sm'}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className={`break-words ${simple ? 'text-xl font-bold' : today ? 'text-sm font-semibold' : 'font-semibold'}`}>{chore.title}</span>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-slate-400">
              <span>
                {assignmentLabel(chore, claimedBy)}
                {daysOfWeek.length
                  ? ` · ${daysOfWeek.map((d) => DOW[d]).join(daysOfWeek.length > 1 && chore.daysOfWeekMode === 'ANY' ? ' or ' : ', ')}`
                  : ''}
                {chore.dueTime ? ` · due ${formatDueTime(chore.dueTime)}` : ''}
              </span>
              {next && <span>· 🔁 {REPEAT_LABEL[chore.recurrenceRule ?? ''] ?? 'Repeats'} · {relativeDayLabel(next)}</span>}
              {isAdult && chore.createdBy && <span>· added by {chore.createdBy.displayName}</span>}
              {chore.currentStreak > 0 && (
                <span className="inline-flex items-center gap-1">
                  · <LucideIcon name="flame" slot="badge.streak" size={12} /> {chore.currentStreak} in a row
                  {!!chore.streakGoal && chore.useWheelForBonus ? (
                    <>
                      (<LucideIcon name="ferris-wheel" slot="chores.bonusWheel" size={12} /> wheel every {chore.streakGoal})
                    </>
                  ) : !!chore.streakGoal && chore.streakBonusTokens > 0 ? (
                    `(bonus every ${chore.streakGoal})`
                  ) : null}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <TokenBadge icon={tokenIcon} amount={chore.tokenValue} />
            {chore.location && <span className="text-xs text-slate-400">📍 {chore.location.name}</span>}
          </div>
        </div>

        {chore.checklist.length > 0 && active && (
          <ul className="mt-2 space-y-1 pl-1">
            {chore.checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked.has(item.id)}
                  disabled={!mine || active.status !== 'OPEN'}
                  onChange={(e) => act(() => client.checkItem(active.id, item.id, e.target.checked))}
                />
                <span className={checked.has(item.id) ? 'text-slate-400 line-through' : ''}>{item.label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {active?.status === 'OPEN' && !dueNow && (
            <span className="text-xs text-slate-400">
              Next: {new Date(active.dueDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          )}
          {active?.status === 'OPEN' && openToClaim && (
            <button
              onClick={() => act(() => client.claimInstance(active.id))}
              disabled={presenceBlocked}
              className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Claim this
            </button>
          )}
          {active?.status === 'OPEN' && dueNow && mine && chore.requireProof && (
            <ProofButton client={client} instanceId={active.id} hasProof={!!active.hasProof} onChanged={refresh} />
          )}
          {active?.status === 'OPEN' && dueNow && mine && (
            <button
              onClick={(e) => act(() => client.completeInstance(active.id), e.currentTarget, 'choreCompleted')}
              disabled={presenceBlocked}
              className={
                (simple
                  ? 'rounded-lg bg-slate-800 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700'
                  : 'rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700') + ' disabled:opacity-40 disabled:hover:bg-slate-800'
              }
            >
              Mark done
            </button>
          )}
          {active?.status === 'OPEN' && dueNow && mine && chore.allowSkip && (
            <button
              onClick={async () => {
                if (await confirmSkip()) await act(() => client.skipInstance(active.id));
              }}
              disabled={presenceBlocked}
              className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Skip
            </button>
          )}
          {active?.status === 'OPEN' && mine && chore.assignmentType === 'ANYONE' && (
            <button
              onClick={() => act(() => client.unclaimInstance(active.id))}
              className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50"
              title="Let someone else take this one"
            >
              Unclaim
            </button>
          )}
          {active?.status === 'SKIPPED' && (mine || isAdult) && (
            <button
              onClick={() => act(() => client.unskipInstance(active.id))}
              className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50"
              title="Put it back on the list for today"
            >
              Undo skip
            </button>
          )}
          {active?.status === 'OPEN' && dueNow && !mine && !openToClaim && (
            <span className="text-xs text-slate-400">Not assigned to you</span>
          )}
          {active?.status === 'PENDING' && (
            <span className="text-xs font-medium text-amber-600">Pending approval</span>
          )}
          {active?.status === 'PENDING' && isAdult && (
            <>
              <button
                onClick={(e) => act(() => client.approveInstance(active.id), e.currentTarget, approveSlot)}
                className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500"
              >
                Approve
              </button>
              <button
                onClick={() => act(() => client.rejectInstance(active.id))}
                className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50"
              >
                Reject
              </button>
            </>
          )}
          {active?.status === 'APPROVED' && (
            <span className="text-xs text-green-600">
              Done ✓{active.approvedByUser && ` - approved by ${active.approvedByUser.displayName}`}
            </span>
          )}
          {active?.status === 'MISSED' && (
            <span className="text-xs font-medium text-red-500">Missed - no {tokenName} earned</span>
          )}
          {active?.status === 'SKIPPED' && (
            <span className="text-xs font-medium text-slate-400">Skipped</span>
          )}

          {isAdult && !today && (
            <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
              {active && claimedBy && (
                <button onClick={() => act(() => client.assignInstance(active.id, null))} className="hover:text-slate-700">
                  Unassign
                </button>
              )}
              <button onClick={() => act(() => client.reopenChore(chore.id))} className="hover:text-slate-700">
                Enable again
              </button>
              <button
                onClick={() => {
                  setEditing(chore);
                  setEditingId(chore.id);
                  setFormOpen(true);
                }}
                className="hover:text-slate-700"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setEditing(chore);
                  setEditingId(null);
                  setFormOpen(true);
                }}
                title={`Prefill a new ${choreWord.toLowerCase()} with these same settings - handy for one-per-person chores instead of a shared one`}
                className="hover:text-slate-700"
              >
                Duplicate
              </button>
              <button
                onClick={async () => {
                  if (await confirm(`Delete this ${choreWord.toLowerCase()}?`, { danger: true, confirmLabel: 'Delete' })) {
                    await act(() => client.deleteChore(chore.id));
                  }
                }}
                className="btn-delete rounded px-2 py-0.5"
              >
                Delete
              </button>
            </span>
          )}
        </div>
      </li>
    );
  }

  return (
    <section>
      {showHouseholdTabs && (
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            onClick={() => setHouseholdTab('')}
            className={`rounded-full border px-3 py-1 text-sm ${householdTab === '' ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
          >
            All households
          </button>
          {myHouseholds.map((h) => (
            <button
              key={h.id}
              onClick={() => setHouseholdTab(h.id)}
              className={`rounded-full border px-3 py-1 text-sm ${householdTab === h.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={today ? 'text-lg font-bold tracking-tight' : 'text-xl font-bold tracking-tight'}>
          {today ? 'Today' : chorePlural}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {!today && (
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${chorePlural.toLowerCase()}…`}
              className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm sm:w-44 sm:flex-none"
            />
          )}
          {showLocationDropdown && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="NONE">No location</option>
            </select>
          )}
          {!today && isAdult && members.length > 0 && (
            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">Everyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
              <option value="ANYONE">Open to anyone</option>
            </select>
          )}
          {!today && !narrow && (
            <button
              onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
              title="Switch layout"
            >
              {viewMode === 'cards' ? '☰ Table view' : '▦ Card view'}
            </button>
          )}
          {!today && isAdult && (
            <button onClick={() => setPacksOpen(true)} className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50" title="Add a ready-made set of chores">
              <LucideIcon name="package" slot="chores.packs" size={14} /> Packs
            </button>
          )}
          {isAdult && (
            <button
              onClick={() => {
                setEditing(null);
                setEditingId(null);
                setFormOpen(true);
              }}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              + New {choreWord}
            </button>
          )}
        </div>
      </div>

      {today && !myTokensOff && (
        <div className="mt-2">
          <TokenBadge icon={tokenIcon} amount={myBalance} label={tokenName} size="lg" />
        </div>
      )}

      {pendingWheels.length > 0 && (
        <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--tag-bg)', color: 'var(--tag-text)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <LucideIcon name="ferris-wheel" slot="chores.bonusWheel" size={24} />
            <span className="min-w-0 flex-1 text-sm font-semibold">
              {pendingWheels.length === 1
                ? `You earned a bonus wheel for ${wheelSource(pendingWheels[0])}!`
                : `You have ${pendingWheels.length} bonus wheels to spin!`}
            </span>
            <button
              onClick={() => setWheel(pendingWheels[0])}
              disabled={presenceBlocksAnything}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800"
            >
              Spin now
            </button>
          </div>
          {pendingWheels.length > 1 && (
            <ul className="mt-2 space-y-1 text-xs">
              {pendingWheels.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words">{wheelSource(w)}</span>
                  <button
                    onClick={() => setWheel(w)}
                    disabled={presenceBlocksAnything}
                    className="shrink-0 rounded border px-2 py-0.5 hover:bg-white/40 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Spin
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showPending && isAdult && (
        <div className="mt-3">
          <PendingPanel
            chores={chores}
            client={client}
            prizeClient={prizeClient()}
            members={members}
            tokenName={tokenName}
            tokenIcon={tokenIcon}
            onChanged={refresh}
          />
        </div>
      )}

      {today ? (
        <ul className="mt-3 space-y-2">
          {todayRows.map(renderRow)}
          {todayRows.length === 0 && <li className="text-sm text-slate-400">Nothing to earn today</li>}
        </ul>
      ) : effectiveView === 'table' ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-400">
                {(
                  [
                    ['title', 'Title'],
                    ['location', 'Location'],
                    ['assigned', 'Assigned'],
                    ['due', 'Due'],
                    ['tokens', tokenName],
                    ['status', 'Status'],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} className="cursor-pointer select-none px-2 py-2 hover:text-slate-600" onClick={() => toggleSort(key)}>
                    {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </th>
                ))}
                {isAdult && <th className="px-2 py-2">Added by</th>}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ chore, active, claimedBy, mine, dueNow, openToClaim, presenceBlocked }) => (
                <tr key={chore.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-2 py-2 font-medium">{chore.title}</td>
                  <td className="px-2 py-2 text-slate-500">{chore.location?.name ?? '-'}</td>
                  <td className="px-2 py-2 text-slate-500">{assignmentLabel(chore, claimedBy)}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {active ? new Date(active.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-'}
                  </td>
                  <td className="px-2 py-2">
                    <TokenBadge icon={tokenIcon} amount={chore.tokenValue} />
                  </td>
                  <td className="px-2 py-2 text-slate-500">{active?.status ?? '-'}</td>
                  {isAdult && <td className="px-2 py-2 text-slate-500">{chore.createdBy?.displayName ?? '-'}</td>}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {active?.status === 'OPEN' && openToClaim && (
                        <button
                          onClick={() => act(() => client.claimInstance(active.id))}
                          disabled={presenceBlocked}
                          className="rounded border px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          Claim
                        </button>
                      )}
                      {active?.status === 'OPEN' && dueNow && mine && (
                        <button
                          onClick={(e) => act(() => client.completeInstance(active.id), e.currentTarget, 'choreCompleted')}
                          disabled={presenceBlocked}
                          className="rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800"
                        >
                          Mark done
                        </button>
                      )}
                      {active?.status === 'OPEN' && dueNow && mine && chore.allowSkip && (
                        <button
                          onClick={async () => {
                            if (await confirmSkip()) await act(() => client.skipInstance(active.id));
                          }}
                          disabled={presenceBlocked}
                          className="rounded border px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          Skip
                        </button>
                      )}
                      {active?.status === 'OPEN' && mine && chore.assignmentType === 'ANYONE' && (
                        <button
                          onClick={() => act(() => client.unclaimInstance(active.id))}
                          className="rounded border px-2 py-1 text-xs hover:bg-slate-100"
                          title="Let someone else take this one"
                        >
                          Unclaim
                        </button>
                      )}
                      {active?.status === 'SKIPPED' && (mine || isAdult) && (
                        <button
                          onClick={() => act(() => client.unskipInstance(active.id))}
                          className="rounded border px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          Undo skip
                        </button>
                      )}
                      {active?.status === 'PENDING' && isAdult && (
                        <>
                          <button onClick={(e) => act(() => client.approveInstance(active.id), e.currentTarget, approveSlot)} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500">
                            Approve
                          </button>
                          <button onClick={() => act(() => client.rejectInstance(active.id))} className="rounded border px-2 py-1 text-xs hover:bg-white">
                            Reject
                          </button>
                        </>
                      )}
                      {isAdult && (
                        <button
                          onClick={() => {
                            setEditing(chore);
                            setEditingId(chore.id);
                            setFormOpen(true);
                          }}
                          className="rounded border px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      )}
                      {isAdult && (
                        <button
                          onClick={() => {
                            setEditing(chore);
                            setEditingId(null);
                            setFormOpen(true);
                          }}
                          className="rounded border px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          Duplicate
                        </button>
                      )}
                      {isAdult && (
                        <button
                          onClick={async () => {
                            if (await confirm(`Delete this ${choreWord.toLowerCase()}?`, { danger: true, confirmLabel: 'Delete' })) {
                              await act(() => client.deleteChore(chore.id));
                            }
                          }}
                          className="btn-delete rounded px-2 py-1 text-xs"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={isAdult ? 8 : 7} className="px-2 py-4 text-center text-sm text-slate-400">
                    No {chorePlural.toLowerCase()} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="text-sm font-semibold text-slate-500">{g.label}</h3>
              <ul className="mt-2 space-y-3">{g.rows.map(renderRow)}</ul>
            </div>
          ))}
          {groups.length === 0 && <p className="text-sm text-slate-400">No {chorePlural.toLowerCase()} yet.</p>}
        </div>
      )}

      {isAdult && !today && balances.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span>Balances:</span>
          {balances
            .filter((b) => !members.find((m) => m.id === b.userId)?.tokensDisabled)
            .map((b) => (
            <span key={b.userId} className="flex items-center gap-1">
              {memberName(b.userId)}: <TokenBadge icon={tokenIcon} amount={b.balance} />
            </span>
          ))}
        </div>
      )}

      {wheel && (
        <RewardRevealModal
          wheel={wheel}
          source={wheelSource(wheel)}
          tokenName={tokenName}
          onSpin={async () => client.spinWheel(wheel.id)}
          onClose={() => {
            setWheel(null);
            refreshWheels();
            refresh();
          }}
        />
      )}
      {packsOpen && (
        <StarterPacksModal
          client={client}
          members={members}
          onClose={() => setPacksOpen(false)}
          onDone={async () => {
            setPacksOpen(false);
            await refresh();
          }}
        />
      )}
      {formOpen && (
        <ChoreForm
          client={client}
          members={members}
          chore={editing}
          choreId={editingId}
          choreWord={choreWord}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {help && <span className="ml-2 text-xs text-slate-400">{help}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ChoreForm({
  client,
  members,
  chore,
  choreId,
  choreWord,
  onClose,
  onSaved,
}: {
  client: ChoreClient;
  members: Member[];
  // Seeds every field below regardless of mode - for a duplicate, `chore` is
  // the source row but `choreId` is null, so submit() below still POSTs a new
  // one instead of PATCHing the original.
  chore: Chore | null;
  choreId?: string | null;
  choreWord: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isDuplicate = !!chore && !choreId;
  const [title, setTitle] = useState(chore ? (isDuplicate ? `${chore.title} (copy)` : chore.title) : '');
  const [assignmentType, setAssignmentType] = useState<'SPECIFIC' | 'ANYONE'>(chore?.assignmentType ?? 'SPECIFIC');
  const [assignees, setAssignees] = useState<Set<string>>(
    new Set(chore?.assignees.map((a) => a.userId) ?? []),
  );
  const [tokenValue, setTokenValue] = useState(chore?.tokenValue ?? 0);
  const [repeat, setRepeat] = useState(chore?.recurrenceRule ?? '');
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(new Set(chore ? resolveDaysOfWeek(chore) : []));
  // EACH (default): every picked day is its own separate occurrence - "Sat
  // AND Sun" both come due. ANY: the picked days share ONE occurrence for
  // the whole period, completable on any one of them - "Mon OR Tue OR Wed",
  // and doing it on Monday means Tuesday/Wednesday are never separately up
  // for it that same week. Only shown (below) with 2+ days picked.
  const [daysOfWeekMode, setDaysOfWeekMode] = useState<'EACH' | 'ANY'>(chore?.daysOfWeekMode === 'ANY' ? 'ANY' : 'EACH');
  const [dueTime, setDueTime] = useState(chore?.dueTime ?? '');
  const [checklist, setChecklist] = useState((chore?.checklist ?? []).map((c) => c.label).join('\n'));
  // New chores default to whichever household was picked last - most families
  // add several in a row for the same place. An existing chore always shows
  // its own location.
  const [locationId, setLocationId] = useState(
    chore?.location?.id ?? (choreId ? '' : localStorage.getItem(LAST_CHORE_LOCATION_KEY) ?? ''),
  );
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [allowLate, setAllowLate] = useState(chore?.allowLate ?? false);
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(chore?.latePenaltyPercent ?? 25);
  const [allowSkip, setAllowSkip] = useState(chore?.allowSkip ?? false);
  const [autoApprove, setAutoApprove] = useState(chore?.autoApprove ?? false);
  const [requireProof, setRequireProof] = useState(chore?.requireProof ?? false);
  const [firstFinisherBonus, setFirstFinisherBonus] = useState(chore?.firstFinisherBonus ?? 0);
  // Which family features are on gates whether the related fields render at
  // all - a family with photoProof off shouldn't see the checkbox.
  const [famDisabled, setFamDisabled] = useState<string[]>([]);
  useEffect(() => {
    client.familySettings().then((f) => setFamDisabled(f.disabledFeatures ?? [])).catch(() => undefined);
  }, [client]);
  const [streakEnabled, setStreakEnabled] = useState(!!chore?.streakGoal);
  const [streakGoal, setStreakGoal] = useState(chore?.streakGoal ?? 5);
  const [streakBonusTokens, setStreakBonusTokens] = useState(chore?.streakBonusTokens ?? 0);
  const [useWheelForBonus, setUseWheelForBonus] = useState(chore?.useWheelForBonus ?? false);

  useEffect(() => {
    client.locations().then(setLocations).catch(() => undefined);
  }, [client]);

  const repeatHelp = REPEAT_OPTIONS.find((r) => r.value === repeat)?.help ?? '';
  // A SPECIFIC chore with nobody picked is assigned to no one and claimable
  // by no one - it'd save fine but then never appear in any group, with no
  // way to find or edit it again.
  const needsAssignee = assignmentType === 'SPECIFIC' && assignees.size === 0;

  async function submit() {
    if (!title || needsAssignee) return;
    const body = {
      title,
      assignmentType,
      assigneeUserIds: assignmentType === 'SPECIFIC' ? [...assignees] : [],
      tokenValue: Number(tokenValue),
      recurrenceRule: repeat || undefined,
      daysOfWeek: daysOfWeek.size ? [...daysOfWeek].sort() : [],
      daysOfWeekMode: daysOfWeek.size > 1 ? daysOfWeekMode : 'EACH',
      dueTime: dueTime || null,
      checklist: checklist.split('\n').map((s) => s.trim()).filter(Boolean),
      locationId: locationId || null,
      allowLate,
      latePenaltyPercent: Math.max(0, Math.min(100, Number(latePenaltyPercent) || 0)),
      allowSkip,
      autoApprove,
      requireProof,
      firstFinisherBonus: Math.max(0, Number(firstFinisherBonus) || 0),
      streakGoal: streakEnabled ? Math.max(1, Number(streakGoal) || 1) : null,
      streakBonusTokens: streakEnabled ? Math.max(0, Number(streakBonusTokens) || 0) : 0,
      useWheelForBonus: streakEnabled && useWheelForBonus,
    };
    localStorage.setItem(LAST_CHORE_LOCATION_KEY, locationId || '');
    if (choreId) await client.updateChore(choreId, body);
    else await client.createChore(body);
    onSaved();
  }

  return (
    <Modal
      header={<h3 className="text-lg font-bold">{choreId ? `Edit ${choreWord}` : `New ${choreWord}`}</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={needsAssignee || !title}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {choreId ? 'Save changes' : `Create ${choreWord}`}
          </button>
        </div>
      }
    >
        <div className="space-y-4">
          {isDuplicate && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Duplicating "{chore?.title}" - this creates a separate {choreWord.toLowerCase()}, not a copy linked to the
              original. Its own history and streak start fresh.
            </p>
          )}
          <Field label={`${choreWord} name`}>
            <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g. Take out the trash" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field label="Who does it?">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={assignmentType === 'SPECIFIC'} onChange={() => setAssignmentType('SPECIFIC')} />
                Specific people
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={assignmentType === 'ANYONE'} onChange={() => setAssignmentType('ANYONE')} />
                Open to anyone
              </label>
            </div>
            {assignmentType === 'SPECIFIC' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={assignees.has(m.id)}
                      onChange={(e) => {
                        const n = new Set(assignees);
                        if (e.target.checked) n.add(m.id);
                        else n.delete(m.id);
                        setAssignees(n);
                      }}
                    />
                    {m.displayName}
                  </label>
                ))}
              </div>
            )}
            {needsAssignee && (
              <p className="mt-1 text-xs text-red-500">Pick at least one person, or switch to "Open to anyone".</p>
            )}
            {assignmentType === 'SPECIFIC' && assignees.size > 1 && (
              <p className="mt-1 text-xs text-amber-600">
                Shared: it's one {choreWord.toLowerCase()} for all {assignees.size} people. Whoever marks it done
                first finishes it for everyone else too, and only that person gets the reward - it won't show as
                still-to-do for the others. Want each person tracked (and paid) separately instead? Use "Duplicate"
                on a saved {choreWord.toLowerCase()} to make one per person.
              </p>
            )}
          </Field>

          <Field label="Location" help="Optional - for split households, who sees this depends on their location.">
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reward" help="Tokens for whoever completes it (after approval).">
            <input type="number" min={0} className="w-28 rounded-md border px-3 py-2 text-sm" value={tokenValue} onChange={(e) => setTokenValue(Number(e.target.value))} onFocus={(e) => e.target.select()} />
          </Field>

          <Field
            label="If missed"
            help={
              allowLate
                ? "Can still be marked done late - reward shrinks the longer it's overdue."
                : 'Missing the due date forfeits the reward entirely (default).'
            }
          >
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
              Allow marking done late
            </label>
            {allowLate && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 rounded-md border px-3 py-2 text-sm"
                  value={latePenaltyPercent}
                  onChange={(e) => setLatePenaltyPercent(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                />
                % reward lost per day late
              </label>
            )}
          </Field>

          <Field
            label="Skipping"
            help={`Lets whoever it's assigned to skip an occurrence outright - no reward, no checklist, doesn't count as missed. For something genuinely optional some days, like homework that isn't assigned every night.`}
          >
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowSkip} onChange={(e) => setAllowSkip(e.target.checked)} />
              Allow skipping
            </label>
          </Field>

          <Field
            label="Approval"
            help="Trust chore: completing it awards the reward immediately, with no adult approval step. For habits you don't need to inspect, like brushing teeth."
          >
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
              Auto-approve on completion
            </label>
          </Field>

          {!famDisabled.includes('photoProof') && (
            <Field label="Photo proof" help="A kid must attach a photo (made bed, clean room) before marking this done.">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requireProof} onChange={(e) => setRequireProof(e.target.checked)} />
                Require a photo
              </label>
            </Field>
          )}

          {assignmentType === 'ANYONE' && (
            <Field label="First finisher bonus" help="Extra reward for whoever grabs and finishes it - a little sibling race.">
              <input
                type="number"
                min={0}
                value={firstFinisherBonus}
                onChange={(e) => setFirstFinisherBonus(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-24 rounded-md border px-3 py-2 text-sm"
              />
            </Field>
          )}

          <Field label="Repeat" help={repeatHelp}>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              {REPEAT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {(repeat === '' || repeat === 'WEEKLY' || repeat === 'BIWEEKLY') && (
            <Field label="Day(s) of week" help="Optional - pick one, or several for something like Mon-Fri homework.">
              <div className="flex flex-wrap gap-1">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDaysOfWeek((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className={`rounded-md border px-3 py-1 text-sm ${daysOfWeek.has(i) ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {daysOfWeek.size > 1 && (
                <label className="mt-2 flex items-start gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={daysOfWeekMode === 'ANY'}
                    onChange={(e) => setDaysOfWeekMode(e.target.checked ? 'ANY' : 'EACH')}
                  />
                  <span>
                    Any ONE of these days, not all of them
                    <span className="block text-xs text-slate-400">
                      One occurrence for the whole period instead of a separate one per day - doing it on any picked
                      day covers the rest until it comes back around.
                    </span>
                  </span>
                </label>
              )}
            </Field>
          )}

          <Field label="Due by" help="Optional - a specific time of day. Leave blank for end of day (11:59pm).">
            <input
              type="time"
              className="w-40 rounded-md border px-3 py-2 text-sm"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </Field>

          <Field label="Streak bonus" help="Optional - extra tokens for keeping a streak of on-time completions going.">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={streakEnabled} onChange={(e) => setStreakEnabled(e.target.checked)} />
              Award a bonus every so many in a row
            </label>
            {streakEnabled && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                Every
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded-md border px-2 py-1 text-sm"
                  value={streakGoal}
                  onChange={(e) => setStreakGoal(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                />
                in a row, award
                <input
                  type="number"
                  min={0}
                  disabled={useWheelForBonus}
                  className="w-20 rounded-md border px-2 py-1 text-sm disabled:opacity-40"
                  value={streakBonusTokens}
                  onChange={(e) => setStreakBonusTokens(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                />
                bonus tokens
              </div>
            )}
            {/* Wheel and flat bonus tokens are mutually exclusive per chore
                (never both, never one silently overriding the other family-
                wide) - only offered at all once the family's turned the
                bonusWheel feature on. */}
            {streakEnabled && !famDisabled.includes('bonusWheel') && !famDisabled.includes('tokens') && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useWheelForBonus} onChange={(e) => setUseWheelForBonus(e.target.checked)} />
                <LucideIcon name="ferris-wheel" slot="chores.bonusWheel" size={14} /> Spin the bonus wheel instead of awarding flat tokens
              </label>
            )}
          </Field>

          <Field label="Checklist" help="Optional - one sub-task per line.">
            <textarea className="h-24 w-full rounded-md border px-3 py-2 text-sm" placeholder={'e.g.\nGather trash from each room\nTake bins to the curb'} value={checklist} onChange={(e) => setChecklist(e.target.value)} />
          </Field>
        </div>
    </Modal>
  );
}


// One-tap chore bundles by age bucket. Picks an assignee, then creates each
// template chore for them (server validates like any hand-made chore).
function StarterPacksModal({
  client,
  members,
  onClose,
  onDone,
}: {
  client: ChoreClient;
  members: Member[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const kids = members.filter((m) => m.role === 'KID');
  const candidates = kids.length ? kids : members;

  async function add(packId: string) {
    const pack = STARTER_PACKS.find((p) => p.id === packId);
    if (!pack || !assignee) return;
    setBusy(true);
    try {
      for (const c of pack.chores) {
        await client.createChore({
          title: c.title,
          assignmentType: 'SPECIFIC',
          assigneeUserIds: [assignee],
          tokenValue: c.tokenValue,
          recurrenceRule: c.recurrenceRule || undefined,
          daysOfWeek: c.daysOfWeek ?? [],
          checklist: c.checklist ?? [],
          autoApprove: c.autoApprove ?? false,
          allowSkip: c.allowSkip ?? false,
        });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      header={<h3 className="text-lg font-bold">Starter packs</h3>}
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
            Close
          </button>
        </div>
      }
      onBackdropClick={onClose}
    >
      <p className="text-sm text-slate-500">Add a ready-made, age-appropriate set of chores for one person. Everything is editable afterwards.</p>
      <div className="mt-3">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
          <option value="">Who are these for?</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-4 space-y-3">
        {STARTER_PACKS.map((p) => (
          <li key={p.id} className="card-nested rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="ml-2 text-xs text-slate-400">ages {p.ages}</span>
              </div>
              <button
                disabled={!assignee || busy}
                onClick={() => add(p.id)}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {busy ? 'Adding…' : `Add ${p.chores.length}`}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">{p.chores.map((c) => c.title).join(' · ')}</p>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
