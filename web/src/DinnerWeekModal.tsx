import { useCallback, useEffect, useState } from 'react';
import { api, type MealPlanEntry } from './api';
import Modal from './Modal';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

// The week's dinner plan as a popout — same 7-day grid and inline-edit
// pattern as the Household page's widget, just reachable from wherever
// someone glances at "tonight" and wants the whole week instead: the
// kiosk's "Tonight" banner, and a day click on the main calendar (which
// opens this on the week containing that day, so the clicked day's own
// plan is right there in context).
export default function DinnerWeekModal({
  around,
  locationId,
  canEdit,
  onClose,
}: {
  // Any date within the week to show — defaults to today.
  around?: string;
  locationId?: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(around ? new Date(`${around}T00:00:00`) : new Date()));
  const [meals, setMeals] = useState<Record<string, MealPlanEntry>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const refresh = useCallback(() => {
    api
      .meals(dateKey(weekStart), dateKey(addDays(weekStart, 6)), locationId ?? undefined)
      .then((rows) => {
        // Same merge rule as the Household widget: a scoped view shows the
        // house's own meal over a family-wide one on the same date.
        const sorted = [...rows].sort((a, b) => (a.locationId ? 1 : 0) - (b.locationId ? 1 : 0));
        setMeals(Object.fromEntries(sorted.map((m) => [m.date, m])));
      })
      .catch(() => setMeals({}));
  }, [weekStart, locationId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save(date: string) {
    const title = draft.trim();
    if (title) await api.setMeal(date, { title, locationId: locationId ?? null });
    else if (meals[date]) await api.deleteMeal(date, meals[date].locationId ?? null);
    setEditing(null);
    refresh();
  }

  const todayKey = dateKey(new Date());
  const aroundKey = around ?? todayKey;

  return (
    <Modal
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">🍽️ Dinner plan</h3>
          <div className="flex items-center gap-1 text-sm">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded border px-2 py-1 hover:bg-slate-50">
              ‹
            </button>
            <span className="px-1 text-slate-500">
              {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} week
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded border px-2 py-1 hover:bg-slate-50">
              ›
            </button>
          </div>
        </div>
      }
      onBackdropClick={onClose}
      footer={
        <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
          Close
        </button>
      }
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const k = dateKey(d);
          const meal = meals[k];
          return (
            <li
              key={k}
              className={`card-nested rounded-lg p-2 ${k === todayKey ? 'ring-2 ring-[var(--today)]' : ''} ${
                k === aroundKey && k !== todayKey ? 'ring-2 ring-[var(--accent)]' : ''
              }`}
            >
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
                  disabled={!canEdit}
                  onClick={() => {
                    setEditing(k);
                    setDraft(meal?.title ?? '');
                  }}
                  className="mt-1 w-full rounded px-1 py-1 text-left text-sm hover:bg-slate-50 disabled:cursor-default"
                >
                  {meal?.title || <span className="text-slate-400">{canEdit ? '+ add' : 'Nothing planned'}</span>}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
