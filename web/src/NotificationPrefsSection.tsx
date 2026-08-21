import { useEffect, useMemo, useState } from 'react';
import { api, type Me, type Member, type FamilyLocation, type NotifyChannel, type NotifyPrefs } from './api';
import LucideIcon from './LucideIcon';

// Human labels for the handful of notification types that actually reach an
// adult ABOUT someone else's activity (see server NotificationsService's
// KID_SCOPED_TYPES/GLOBAL_ADULT_TYPES - every other type goes straight to
// the person it's about, not to an observing adult, so there's nothing here
// to prefer). Icon keys mirror NotificationsPage's TYPE_ICON so a type reads
// the same wherever it shows up.
const TYPE_LABEL: Record<string, string> = {
  CHORE_PENDING: 'Chore finished, needs approval',
  PRIZE_SUGGESTED: 'Prize suggested for the store',
  REDEMPTION_REQUESTED: 'Prize redemption requested',
  GAME_PRIZE_WON: 'Won a real prize from a reward game',
  CHORE_EXCUSED: 'Marked themselves away/vacation',
  CALENDAR_EVENT_ADDED: 'Calendar event added',
  CALENDAR_EVENT_REMINDER: 'Calendar event reminder',
  MEMBER_JOINED: 'New family member joined',
  STREAK_BONUS: 'Weekly chore digest',
};
const TYPE_ICON: Record<string, string> = {
  CHORE_PENDING: 'hourglass',
  PRIZE_SUGGESTED: 'lightbulb',
  REDEMPTION_REQUESTED: 'gift',
  GAME_PRIZE_WON: 'gift',
  CHORE_EXCUSED: 'moon',
  CALENDAR_EVENT_ADDED: 'calendar',
  CALENDAR_EVENT_REMINDER: 'alarm-clock',
  MEMBER_JOINED: 'user-plus',
  STREAK_BONUS: 'flame',
};
const CHANNELS: Array<{ id: NotifyChannel; label: string }> = [
  { id: 'inapp', label: 'In-app' },
  { id: 'push', label: 'Push' },
  { id: 'email', label: 'Email' },
];

export default function NotificationPrefsSection({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const isTopManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState<NotifyPrefs>({});
  const [defaultChannels, setDefaultChannels] = useState<NotifyChannel[]>(['inapp', 'push']);
  const [kidTypes, setKidTypes] = useState<string[]>([]);
  const [globalTypes, setGlobalTypes] = useState<string[]>([]);
  const [kids, setKids] = useState<Member[]>([]);
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdult) return;
    api
      .notifyPrefs()
      .then((r) => {
        setPrefs(r.prefs ?? {});
        setDefaultChannels(r.notifyByEmail ? ['inapp', 'push', 'email'] : ['inapp', 'push']);
        setKidTypes(r.kidScopedTypes);
        setGlobalTypes(r.globalTypes);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    api.listUsers().then((ms) => setKids(ms.filter((m) => m.role === 'KID'))).catch(() => undefined);
    if (!isTopManager) api.locations().then(setLocations).catch(() => undefined);
  }, [isAdult, isTopManager]);

  // Same "plain adult only sees their own household" convention used on the
  // Store page's member picker - a non-custodial adult account shouldn't be
  // offered every kid in the whole family to set prefs for, just the ones
  // they actually share a roof with (or all of them if they have no
  // household of their own yet - nothing sensible to scope by).
  const locationIdsByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of locations) {
      for (const u of l.users) {
        if (!map.has(u.userId)) map.set(u.userId, new Set());
        map.get(u.userId)!.add(l.id);
      }
    }
    return map;
  }, [locations]);
  const myLocationIds = useMemo(() => locationIdsByUser.get(me.id) ?? new Set<string>(), [locationIdsByUser, me.id]);
  const visibleKids = useMemo(() => {
    if (isTopManager || myLocationIds.size === 0) return kids;
    return kids.filter((k) => {
      const theirLocs = locationIdsByUser.get(k.id);
      return theirLocs ? [...theirLocs].some((id) => myLocationIds.has(id)) : false;
    });
  }, [kids, isTopManager, myLocationIds, locationIdsByUser]);

  useEffect(() => {
    if (!selectedKidId && visibleKids.length) setSelectedKidId(visibleKids[0].id);
  }, [visibleKids, selectedKidId]);

  async function persist(next: NotifyPrefs) {
    setPrefs(next);
    try {
      await api.setNotifyPrefs(next);
    } catch (e) {
      setSaveError((e as Error).message || "Couldn't save - try again.");
    }
  }

  function channelsFor(type: string, kidId?: string): NotifyChannel[] {
    const entry = kidId ? prefs.kid?.[kidId]?.[type] : prefs.global?.[type];
    return entry ?? defaultChannels;
  }

  function toggle(type: string, channel: NotifyChannel, kidId?: string) {
    const current = channelsFor(type, kidId);
    const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
    const clone: NotifyPrefs = { kid: { ...prefs.kid }, global: { ...prefs.global } };
    if (kidId) {
      clone.kid![kidId] = { ...clone.kid![kidId], [type]: next };
    } else {
      clone.global![type] = next;
    }
    persist(clone);
  }

  function typeRow(type: string, kidId?: string) {
    const active = channelsFor(type, kidId);
    return (
      <div key={type} className="flex flex-wrap items-center gap-3 py-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <LucideIcon name={TYPE_ICON[type] ?? 'bell'} slot={`notif.${type}`} size={16} />
          {TYPE_LABEL[type] ?? type}
        </span>
        <span className="flex shrink-0 gap-3">
          {CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-xs text-slate-500">
              <input type="checkbox" checked={active.includes(c.id)} onChange={() => toggle(type, c.id, kidId)} />
              {c.label}
            </label>
          ))}
        </span>
      </div>
    );
  }

  if (!isAdult || !loaded) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-xs text-slate-500">
        What you personally get notified about, and on which channel(s). Unchecked here just means "not this way" -
        someone else may still see it their own way. A type with no boxes checked never notifies you about that at all.
      </p>
      {saveError && <p className="mt-1 text-xs text-red-500">{saveError}</p>}

      {globalTypes.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">General</h4>
          <div className="mt-1 divide-y">{globalTypes.map((t) => typeRow(t))}</div>
        </div>
      )}

      {kidTypes.length > 0 && visibleKids.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">About a specific kid</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {visibleKids.map((k) => (
              <button
                key={k.id}
                onClick={() => setSelectedKidId(k.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedKidId === k.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'
                }`}
              >
                {k.displayName}
              </button>
            ))}
          </div>
          {selectedKidId && <div className="mt-2 divide-y">{kidTypes.map((t) => typeRow(t, selectedKidId))}</div>}
        </div>
      )}
    </div>
  );
}
