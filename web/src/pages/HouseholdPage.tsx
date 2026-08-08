import { useCallback, useEffect, useState } from 'react';
import {
  api,
  familyFeatureEnabled,
  type AnnouncementEntry,
  type CountdownEntry,
  type FamilySettings,
  type GroceryItem,
  type Me,
  type MealPlanEntry,
} from '../api';
import { formatDate } from '../dateFormat';

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

// Meal plan + grocery list + countdowns + announcements — the family's
// "kitchen wall" page. Sections appear only when the family feature is on.
export default function HouseholdPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const [family, setFamily] = useState<FamilySettings | null>(null);
  useEffect(() => {
    api.familySettings().then(setFamily).catch(() => undefined);
  }, []);

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
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Household</h2>
      {meals && <MealsSection isAdult={isAdult} />}
      <div className="grid gap-6 lg:grid-cols-2">
        {grocery && <GrocerySection />}
        <div className="space-y-6">
          {countdowns && <CountdownsSection isAdult={isAdult} />}
          {announcements && <AnnouncementsSection isAdult={isAdult} />}
        </div>
      </div>
    </div>
  );
}

function MealsSection({ isAdult }: { isAdult: boolean }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [meals, setMeals] = useState<Record<string, MealPlanEntry>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const refresh = useCallback(() => {
    api
      .meals(dateKey(weekStart), dateKey(addDays(weekStart, 6)))
      .then((rows) => setMeals(Object.fromEntries(rows.map((m) => [m.date, m]))))
      .catch(() => setMeals({}));
  }, [weekStart]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save(date: string) {
    const title = draft.trim();
    if (title) await api.setMeal(date, { title });
    else if (meals[date]) await api.deleteMeal(date);
    setEditing(null);
    refresh();
  }

  const todayKey = dateKey(new Date());
  return (
    <section className="panel">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight">🍽️ Dinner plan</h3>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded border px-2 py-1 hover:bg-slate-50">‹</button>
          <span className="px-1 text-slate-500">
            {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} week
          </span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded border px-2 py-1 hover:bg-slate-50">›</button>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const k = dateKey(d);
          const meal = meals[k];
          return (
            <li key={k} className={`card-nested rounded-lg p-2 ${k === todayKey ? 'ring-2 ring-[var(--today)]' : ''}`}>
              <div className="text-xs font-medium text-slate-400">
                {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
              </div>
              {editing === k ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => save(k)}
                  onKeyDown={(e) => e.key === 'Enter' && save(k)}
                  className="mt-1 w-full rounded border px-1.5 py-1 text-sm"
                  placeholder="Dinner…"
                />
              ) : (
                <button
                  disabled={!isAdult}
                  onClick={() => {
                    setEditing(k);
                    setDraft(meal?.title ?? '');
                  }}
                  className="mt-1 w-full rounded px-1 py-1 text-left text-sm hover:bg-slate-50 disabled:cursor-default"
                >
                  {meal?.title || <span className="text-slate-300">{isAdult ? '+ add' : '—'}</span>}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GrocerySection() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [label, setLabel] = useState('');
  const refresh = useCallback(() => {
    api.grocery().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    const l = label.trim();
    if (!l) return;
    setLabel('');
    await api.addGrocery(l);
    refresh();
  }
  const anyChecked = items.some((i) => i.checked);
  return (
    <section className="panel">
      <h3 className="text-base font-semibold tracking-tight">🛒 Grocery list</h3>
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
      <ul className="mt-3 space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={i.checked}
              onChange={(e) => api.patchGrocery(i.id, { checked: e.target.checked }).then(refresh)}
            />
            <span className={`flex-1 ${i.checked ? 'text-slate-400 line-through' : ''}`}>{i.label}</span>
            <button onClick={() => api.deleteGrocery(i.id).then(refresh)} className="text-xs text-slate-400 hover:text-red-500">
              ✕
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-slate-400">Nothing needed. Nice.</li>}
      </ul>
      {anyChecked && (
        <button onClick={() => api.clearCheckedGrocery().then(refresh)} className="mt-3 rounded border px-3 py-1 text-xs hover:bg-slate-50">
          Clear checked
        </button>
      )}
    </section>
  );
}

function CountdownsSection({ isAdult }: { isAdult: boolean }) {
  const [items, setItems] = useState<CountdownEntry[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [emoji, setEmoji] = useState('🎉');
  const refresh = useCallback(() => {
    api.countdowns().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    if (!title.trim() || !date) return;
    await api.addCountdown({ title: title.trim(), date, emoji });
    setTitle('');
    setDate('');
    refresh();
  }
  return (
    <section className="panel">
      <h3 className="text-base font-semibold tracking-tight">⏳ Countdowns</h3>
      <ul className="mt-3 space-y-2">
        {items.map((c) => {
          const days = daysUntil(c.date);
          return (
            <li key={c.id} className="card-nested flex items-center gap-3 rounded-lg px-3 py-2">
              <span className="text-2xl">{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="block text-xs text-slate-400">{formatDate(new Date(`${c.date}T00:00:00`))}</span>
              </span>
              <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                {days <= 0 ? '🎊 today!' : `${days}d`}
              </span>
              {isAdult && (
                <button onClick={() => api.deleteCountdown(c.id).then(refresh)} className="text-xs text-slate-400 hover:text-red-500">
                  ✕
                </button>
              )}
            </li>
          );
        })}
        {items.length === 0 && <li className="text-sm text-slate-400">Nothing coming up — add a birthday or trip.</li>}
      </ul>
      {isAdult && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-12 rounded border px-2 py-1.5 text-center text-sm" />
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

function AnnouncementsSection({ isAdult }: { isAdult: boolean }) {
  const [items, setItems] = useState<AnnouncementEntry[]>([]);
  const [text, setText] = useState('');
  const refresh = useCallback(() => {
    api.announcements().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    if (!text.trim()) return;
    await api.addAnnouncement({ text: text.trim() });
    setText('');
    refresh();
  }
  return (
    <section className="panel">
      <h3 className="text-base font-semibold tracking-tight">📣 Announcements</h3>
      <ul className="mt-3 space-y-2">
        {items.map((a) => (
          <li key={a.id} className="card-nested flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <span className="flex-1">{a.text}</span>
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
