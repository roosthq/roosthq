import { useCallback, useEffect, useState } from 'react';
import { api, type EatOutPlace, type MealPlanEntry } from './api';
import { dget } from './displayApi';
import Modal from './Modal';
import LucideIcon from './LucideIcon';
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
  kioskToken,
  kioskDisplay,
  onClose,
}: {
  // Any date within the week to show - defaults to today.
  around?: string;
  locationId?: string | null;
  canEdit: boolean;
  // Set when this modal is opened from the kiosk (Display.tsx) - without it,
  // every WRITE below goes out with no auth at all (the kiosk has no cookie
  // session of its own) and just silently fails. Undefined on the main app,
  // which authenticates via cookie same as everywhere else. Also undefined
  // on the kiosk itself whenever nobody's unlocked a profile - that's exactly
  // when reads need `kioskDisplay` below instead.
  kioskToken?: string;
  // Set (regardless of kioskToken) when this modal is opened from the kiosk -
  // reads go through the display-token route instead of api.meals(), so the
  // week's plan still shows with nobody signed in (matching the "Tonight"
  // banner that opens this, which is readable idle off the same feed).
  // Writes are unaffected by this - they still need a real kioskToken and
  // canEdit, which is already false with nobody signed in.
  kioskDisplay?: boolean;
  onClose: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(around ? new Date(`${around}T00:00:00`) : new Date()));
  const [meals, setMeals] = useState<Record<string, MealPlanEntry>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [places, setPlaces] = useState<EatOutPlace[]>([]);
  const [spinningKey, setSpinningKey] = useState<string | null>(null);
  const [spinDisplay, setSpinDisplay] = useState('');

  const { navigate, animKey, animClass, swipeProps } = useWeekSwipe((delta) => setWeekStart((w) => addDays(w, delta * 7)));

  const refresh = useCallback(() => {
    const start = dateKey(weekStart);
    const end = dateKey(addDays(weekStart, 6));
    const fetchMeals = kioskDisplay
      ? dget<MealPlanEntry[]>('/display/meals', { start, end })
      : api.meals(start, end, locationId ?? undefined, kioskToken);
    fetchMeals
      .then((rows) => {
        // Same merge rule as the Household widget: a scoped view shows the
        // house's own meal over a family-wide one on the same date.
        const sorted = [...rows].sort((a, b) => (a.locationId ? 1 : 0) - (b.locationId ? 1 : 0));
        setMeals(Object.fromEntries(sorted.map((m) => [m.date, m])));
      })
      .catch(() => setMeals({}));
  }, [weekStart, locationId, kioskToken, kioskDisplay]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Places are only ever needed to render the pick/spin controls, so don't
  // bother fetching them for a read-only viewer (kids, or the main app's own
  // popup when opened non-editable).
  useEffect(() => {
    if (canEdit) api.eatOutPlaces(locationId, kioskToken).then(setPlaces).catch(() => setPlaces([]));
  }, [canEdit, locationId, kioskToken]);

  async function save(date: string) {
    const title = draft.trim();
    if (title) await api.setMeal(date, { title, locationId: locationId ?? null }, kioskToken);
    else if (meals[date]) await api.deleteMeal(date, meals[date].locationId ?? null, kioskToken);
    // Only close THIS box - see HouseholdPage's identical save() for why a
    // bare setEditing(null) here would wipe out whichever box the user has
    // since tapped into instead.
    setEditing((cur) => (cur === date ? null : cur));
    refresh();
  }

  // Same toggle/pick/spin logic as the Household page's fuller widget - see
  // that file's comments for the fairness rule (server always rolls first).
  async function toggleOut(k: string) {
    const meal = meals[k];
    if (meal?.isEatingOut) await api.deleteMeal(k, meal.locationId ?? null, kioskToken);
    else await api.setMeal(k, { isEatingOut: true, locationId: locationId ?? null }, kioskToken);
    refresh();
  }

  async function pickPlace(k: string, placeId: string) {
    if (!placeId) return;
    await api.setMeal(k, { isEatingOut: true, eatOutPlaceId: placeId, locationId: locationId ?? null }, kioskToken);
    refresh();
  }

  async function spin(k: string) {
    if (!places.length || spinningKey) return;
    setSpinningKey(k);
    const interval = window.setInterval(() => {
      setSpinDisplay(places[Math.floor(Math.random() * places.length)].name);
    }, 90);
    try {
      await api.spinEatOut(k, locationId ?? null, kioskToken);
    } finally {
      window.clearInterval(interval);
      setSpinningKey(null);
    }
    refresh();
  }

  const todayKey = dateKey(new Date());
  const aroundKey = around ?? todayKey;

  return (
    <Modal
      maxWidthClass="max-w-4xl"
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-2xl font-semibold">
            <LucideIcon name="utensils-crossed" slot="household.dinnerMeal" size={24} /> Dinner plan
          </h3>
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
      <ul key={animKey} {...swipeProps} className={`grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-7 ${animClass}`}>
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
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="text-sm font-medium text-slate-500">
                  {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                </div>
                {canEdit && (
                  // Labeled pill, not a bare icon - same fix as the
                  // Household widget's identical toggle.
                  <button
                    onClick={() => toggleOut(k)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      meal?.isEatingOut
                        ? 'border-[var(--today)] text-amber-600'
                        : 'border-slate-300 text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {meal?.isEatingOut ? 'Eating out' : 'Eating out?'}
                  </button>
                )}
              </div>
              {meal?.isEatingOut ? (
                spinningKey === k ? (
                  <div className="mt-1.5 flex min-h-[2.75rem] items-center gap-1.5 px-2 py-2 text-left text-lg leading-snug">
                    <LucideIcon name="dice-5" slot="household.dinnerRandom" size={18} /> <span className="text-slate-400">{spinDisplay || '…'}</span>
                  </div>
                ) : (
                  <div className="mt-1.5 space-y-1.5">
                    <div className="min-h-[1.75rem] px-2 text-lg leading-snug">
                      {meal.eatOutPlaceName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <LucideIcon name="utensils-crossed" slot="household.dinnerMeal" size={16} /> {meal.eatOutPlaceName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                          <LucideIcon name="utensils-crossed" slot="household.dinnerMeal" size={16} /> Out - TBD
                        </span>
                      )}
                    </div>
                    {canEdit && places.length > 0 && (
                      <div className="flex items-center gap-1 px-1">
                        <select
                          value=""
                          onChange={(e) => pickPlace(k, e.target.value)}
                          className="min-w-0 flex-1 rounded border px-1.5 py-1.5 text-sm"
                        >
                          <option value="">Pick…</option>
                          {places.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => spin(k)} title="Spin to pick randomly" className="shrink-0 rounded border px-2 py-1.5 text-sm hover:bg-slate-50">
                          <LucideIcon name="dice-5" slot="household.dinnerRandom" size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : editing === k ? (
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
