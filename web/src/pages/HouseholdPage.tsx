import { useCallback, useEffect, useState } from 'react';
import {
  api,
  familyFeatureEnabled,
  type AnnouncementEntry,
  type CountdownEntry,
  type FamilyLocation,
  type FamilySettings,
  type GroceryItem,
  type Me,
  type MealPlanEntry,
} from '../api';
import { kidPermissionEnabled, type Member } from '../api';
import { myLocationIds } from '../displayScope';
import { formatDate } from '../dateFormat';
import { useWeekSwipe } from '../useWeekSwipe';
import IconPicker from '../IconPicker';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysUntil(key: string): number {
  const target = new Date(`${key}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// Meal plan + grocery list + countdowns + announcements - the family's
// "kitchen wall" page. Sections appear only when the family feature is on.
export default function HouseholdPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const isTopManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  const [family, setFamily] = useState<FamilySettings | null>(null);
  // Which household this page is looking at. Always a real location once the
  // family has any - locations already are the scoping mechanism, so there's
  // no separate "family-wide" view to pick. '' only ever applies to a family
  // with zero locations defined (everything is implicitly one household).
  // A location's view still merges in any legacy item that has no location
  // (locationId null), it just can't be the ONLY thing shown anymore.
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [scope, setScope] = useState<string>('');
  useEffect(() => {
    api.familySettings().then(setFamily).catch(() => undefined);
    api.locations().then((locs) => {
      setLocations(locs);
      const mine = myLocationIds(locs, me.id);
      const options = isTopManager ? locs : locs.filter((l) => mine.includes(l.id));
      if (options.length > 0) setScope(options[0].id);
    }).catch(() => setLocations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scopeOptions = isTopManager ? locations : locations.filter((l) => myLocationIds(locations, me.id).includes(l.id));

  const meals = familyFeatureEnabled(family, 'meals');
  const grocery = familyFeatureEnabled(family, 'grocery');
  const countdowns = familyFeatureEnabled(family, 'countdowns');
  const announcements = familyFeatureEnabled(family, 'announcements');

  if (family && !meals && !grocery && !countdowns && !announcements) {
    return (
      <p className="text-sm text-slate-500">
        All household features are turned off. {isAdult ? 'Enable them under Settings → Features.' : ''}
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Household</h2>
      {scopeOptions.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {scopeOptions.map((l) => (
            <button
              key={l.id}
              onClick={() => setScope(l.id)}
              className={`rounded-full border px-3 py-1 text-sm ${scope === l.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
            >
              🏠 {l.name}
            </button>
          ))}
        </div>
      )}
      {meals && <MealsSection isAdult={isAdult} scope={scope} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {grocery && <GrocerySection scope={scope} me={me} />}
        <div className="min-w-0 space-y-6">
          {countdowns && <CountdownsSection isAdult={isAdult} scope={scope} />}
          {announcements && <AnnouncementsSection isAdult={isAdult} scope={scope} />}
        </div>
      </div>
    </div>
  );
}

function MealsSection({ isAdult, scope }: { isAdult: boolean; scope: string }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [meals, setMeals] = useState<Record<string, MealPlanEntry>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { navigate, animKey, animClass, swipeProps } = useWeekSwipe((delta) => setWeekStart((w) => addDays(w, delta * 7)));

  const refresh = useCallback(() => {
    api
      .meals(dateKey(weekStart), dateKey(addDays(weekStart, 6)), scope || 'none')
      .then((rows) => {
        // A scoped view merges the house's meals with family-wide ones; when
        // both exist on the same date, the HOUSE one wins the cell (sort
        // family-wide first so scoped rows overwrite them in the dict).
        const sorted = [...rows].sort((a, b) => (a.locationId ? 1 : 0) - (b.locationId ? 1 : 0));
        setMeals(Object.fromEntries(sorted.map((m) => [m.date, m])));
      })
      .catch(() => setMeals({}));
  }, [weekStart, scope]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save(date: string) {
    const title = draft.trim();
    if (title) await api.setMeal(date, { title, locationId: scope || null });
    else if (meals[date]) await api.deleteMeal(date, meals[date].locationId ?? null);
    setEditing(null);
    refresh();
  }

  const todayKey = dateKey(new Date());
  return (
    <section className="panel min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">🍽️ Dinner plan</h3>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => navigate(-1)} className="rounded border px-2.5 py-1.5 hover:bg-slate-50">‹</button>
          <span className="px-1 text-slate-500">
            {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} week
          </span>
          <button onClick={() => navigate(1)} className="rounded border px-2.5 py-1.5 hover:bg-slate-50">›</button>
        </div>
      </div>
      {/* Swipeable, same recognizer as the calendar's own day grid - drag
          anywhere in the grid to page weeks, not just the ‹/› buttons. */}
      <ul key={animKey} {...swipeProps} className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7 ${animClass}`}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const k = dateKey(d);
          const meal = meals[k];
          return (
            <li key={k} className={`card-nested rounded-lg p-2.5 ${k === todayKey ? 'ring-2 ring-[var(--today)]' : ''}`}>
              <div className="text-sm font-medium text-slate-500">
                {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
              </div>
              {editing === k ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => save(k)}
                  onKeyDown={(e) => e.key === 'Enter' && save(k)}
                  className="mt-1.5 w-full rounded border px-2 py-1.5 text-base"
                  placeholder="Dinner…"
                />
              ) : (
                <button
                  disabled={!isAdult}
                  onClick={() => {
                    setEditing(k);
                    setDraft(meal?.title ?? '');
                  }}
                  className="mt-1.5 min-h-[2.5rem] w-full rounded px-2 py-1.5 text-left text-base leading-snug hover:bg-slate-50 disabled:cursor-default"
                >
                  {meal?.title || <span className="text-slate-400">{isAdult ? '+ add' : '-'}</span>}
                  {meal && scope && !meal.locationId && (
                    <span className="block text-xs text-slate-400">family-wide</span>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GrocerySection({ scope, me }: { scope: string; me: Me }) {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [label, setLabel] = useState('');
  // Kid permission gate: the server enforces this too; hiding the inputs just
  // keeps the page honest about what a tap will do.
  const canEdit = kidPermissionEnabled(me as { role?: string; disabledPermissions?: string[] }, 'grocery');
  const refresh = useCallback(() => {
    api.grocery(scope || 'none').then(setItems).catch(() => setItems([]));
  }, [scope]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    const l = label.trim();
    if (!l) return;
    setLabel('');
    await api.addGrocery(l, scope || null);
    refresh();
  }
  const anyChecked = items.some((i) => i.checked);
  return (
    <section className="panel min-w-0">
      <h3 className="text-base font-semibold tracking-tight">🛒 Grocery list</h3>
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add an item…"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
          />
          <button onClick={add} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Add
          </button>
        </div>
      )}
      <ul className="mt-3 space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={i.checked}
              disabled={!canEdit}
              onChange={(e) => api.patchGrocery(i.id, { checked: e.target.checked }).then(refresh)}
            />
            <span className={`flex-1 ${i.checked ? 'text-slate-400 line-through' : ''}`}>
              {i.label}
              {scope && !i.locationId && <span className="ml-1 text-[10px] text-slate-400">(family-wide)</span>}
            </span>
            {canEdit && (
              <button onClick={() => api.deleteGrocery(i.id).then(refresh)} className="text-xs text-slate-400 hover:text-red-500">
                ✕
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-slate-400">Nothing needed. Nice.</li>}
      </ul>
      {anyChecked && (
        <button onClick={() => api.clearCheckedGrocery(scope || null).then(refresh)} className="mt-3 rounded border px-3 py-1 text-xs hover:bg-slate-50">
          Clear checked
        </button>
      )}
    </section>
  );
}

function CountdownsSection({ isAdult, scope }: { isAdult: boolean; scope: string }) {
  const [items, setItems] = useState<CountdownEntry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [emoji, setEmoji] = useState('🎉');
  const refresh = useCallback(() => {
    api.countdowns(scope || 'none').then(setItems).catch(() => setItems([]));
    api.members().then(setMembers).catch(() => setMembers([]));
  }, [scope]);
  // Birthdays ride along as synthetic, non-deletable countdowns (next 90d).
  const birthdayItems: CountdownEntry[] = members
    .filter((m) => m.birthday)
    .map((m) => {
      const [, mm, dd] = m.birthday!.split('-');
      const year = new Date().getFullYear();
      const todayKey2 = dateKey(new Date());
      const thisYear = `${year}-${mm}-${dd}`;
      const next = thisYear >= todayKey2 ? thisYear : `${year + 1}-${mm}-${dd}`;
      return { id: `bday-${m.id}`, title: `${m.displayName}'s birthday`, emoji: '🎂', date: next };
    })
    .filter((b) => daysUntil(b.date) <= 90);
  const allItems = [...items, ...birthdayItems].sort((a, b) => a.date.localeCompare(b.date));
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    if (!title.trim() || !date) return;
    await api.addCountdown({ title: title.trim(), date, emoji, locationId: scope || null });
    setTitle('');
    setDate('');
    refresh();
  }
  return (
    <section className="panel min-w-0">
      <h3 className="text-base font-semibold tracking-tight">⏳ Countdowns</h3>
      <ul className="mt-3 space-y-2">
        {allItems.map((c) => {
          const days = daysUntil(c.date);
          return (
            <li key={c.id} className="card-nested flex min-w-0 items-center gap-3 rounded-lg px-3 py-2">
              <span className="text-2xl">{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {c.title}
                  {scope && !c.locationId && <span className="ml-1 text-[10px] font-normal text-slate-400">(family-wide)</span>}
                </span>
                <span className="block text-xs text-slate-400">{formatDate(new Date(`${c.date}T00:00:00`))}</span>
              </span>
              <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                {days <= 0 ? '🎊 today!' : `${days}d`}
              </span>
              {isAdult && !c.id.startsWith('bday-') && (
                <button onClick={() => api.deleteCountdown(c.id).then(refresh)} className="text-xs text-slate-400 hover:text-red-500">
                  ✕
                </button>
              )}
            </li>
          );
        })}
        {allItems.length === 0 && <li className="text-sm text-slate-400">Nothing coming up - add a trip, or set birthdays in Family & PINs.</li>}
      </ul>
      {isAdult && (
        <div className="mt-3 flex flex-wrap gap-2">
          <IconPicker value={emoji} onChange={setEmoji} buttonSize="h-9 w-12 text-lg" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Disneyland trip"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
          <button onClick={add} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Add
          </button>
        </div>
      )}
    </section>
  );
}

function AnnouncementsSection({ isAdult, scope }: { isAdult: boolean; scope: string }) {
  const [items, setItems] = useState<AnnouncementEntry[]>([]);
  const [text, setText] = useState('');
  const refresh = useCallback(() => {
    api.announcements(scope || 'none').then(setItems).catch(() => setItems([]));
  }, [scope]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    if (!text.trim()) return;
    await api.addAnnouncement({ text: text.trim(), locationId: scope || null });
    setText('');
    refresh();
  }
  return (
    <section className="panel min-w-0">
      <h3 className="text-base font-semibold tracking-tight">📣 Announcements</h3>
      <ul className="mt-3 space-y-2">
        {items.map((a) => (
          <li key={a.id} className="card-nested flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 break-words">
              {a.text}
              {scope && !a.locationId && <span className="ml-1 text-[10px] text-slate-400">(family-wide)</span>}
            </span>
            {isAdult && (
              <button onClick={() => api.deleteAnnouncement(a.id).then(refresh)} className="text-xs text-slate-400 hover:text-red-500">
                ✕
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-slate-400">No announcements.</li>}
      </ul>
      {isAdult && (
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Dentist at 3pm tomorrow…"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
          />
          <button onClick={add} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Post
          </button>
        </div>
      )}
    </section>
  );
}
