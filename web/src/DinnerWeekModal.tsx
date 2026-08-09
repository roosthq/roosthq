import { useCallback, useEffect, useState } from 'react';
import { api, type MealPlanEntry } from './api';
import Modal from './Modal';
import { useWeekSwipe } from './useWeekSwipe';

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

// The week's dinner plan as a popout - same 7-day grid and inline-edit
// pattern as the Household page's widget, just reachable from wherever
// someone glances at "tonight" and wants the whole week instead: the
// kiosk's "Tonight" banner, and a day click on the main calendar (which
// opens this on the week containing that day, so the clicked day's own
// plan is right there in context). Sized for a touch screen first - this
// showed up tiny/hard-to-read on the kiosk - and swipeable left/right
// between weeks like the calendar's own paging, not just the ‹/› buttons.
export default function DinnerWeekModal({
  around,
  locationId,
  canEdit,
  onClose,
}: {
  // Any date within the week to show - defaults to today.
  around?: string;
  locationId?: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(around ? new Date(`${around}T00:00:00`) : new Date()));
  const [meals, setMeals] = useState<Record<string, MealPlanEntry>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { navigate, animKey, animClass, swipeProps } = useWeekSwipe((delta) => setWeekStart((w) => addDays(w, delta * 7)));

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
      maxWidthClass="max-w-4xl"
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-2xl font-semibold">🍽️ Dinner plan</h3>
          <div className="flex items-center gap-2 text-base">
            <button onClick={() => navigate(-1)} className="rounded border px-3 py-2 hover:bg-slate-50">
              ‹
            </button>
            <span className="px-1 text-slate-500">
              {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} week
            </span>
            <button onClick={() => navigate(1)} className="rounded border px-3 py-2 hover:bg-slate-50">
              ›
            </button>
          </div>
        </div>
      }
      onBackdropClick={onClose}
      footer={
        <button onClick={onClose} className="rounded border px-4 py-2.5 text-base hover:bg-slate-50">
          Close
        </button>
      }
    >
      {/* Swipe left/right pages the week, same threshold-based recognizer as
          the calendar's own day grid - a drag anywhere in this area works,
          not just the ‹/› buttons. */}
      <ul key={animKey} {...swipeProps} className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7 ${animClass}`}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const k = dateKey(d);
          const meal = meals[k];
          return (
            <li
              key={k}
              className={`card-nested rounded-lg p-3 ${k === todayKey ? 'ring-2 ring-[var(--today)]' : ''} ${
                k === aroundKey && k !== todayKey ? 'ring-2 ring-[var(--accent)]' : ''
              }`}
            >
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
                  className="mt-1.5 w-full rounded border px-2 py-2 text-lg"
                  placeholder="Dinner…"
                />
              ) : (
                <button
                  disabled={!canEdit}
                  onClick={() => {
                    setEditing(k);
                    setDraft(meal?.title ?? '');
                  }}
                  className="mt-1.5 min-h-[2.75rem] w-full rounded px-2 py-2 text-left text-lg leading-snug hover:bg-slate-50 disabled:cursor-default"
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
