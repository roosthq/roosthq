import { useEffect, useState } from 'react';
import { api, type CalEvent, type EventInput, type MealPlanEntry, type SharedCalendar } from './api';
import Modal from './Modal';
import DinnerWeekModal from './DinnerWeekModal';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Remembers the last calendar picked for a quick-add, so re-opening this
// modal doesn't require re-selecting it every single time. Per-browser, not
// synced anywhere — deliberately low-stakes, just a UI convenience.
const LAST_CALENDAR_KEY = 'roosthq.lastEventCalendarId';

// Reads a Google/local event's own start/end strings directly (no Date object
// round-trip) so the fields shown here are exactly what the event actually
// says — going through Date would silently convert into the browser's own
// timezone, which can differ from the timezone the event was created in.
function prefillFromExisting(e: CalEvent) {
  const isAllDay = !!e.start?.date && !e.start?.dateTime;
  if (isAllDay) {
    const startDate = e.start!.date!;
    // Google's all-day end date is exclusive; the create path already adds a
    // day back on save, so undo that here to show the last INCLUDED day.
    const endDate = e.end?.date ? addDays(e.end.date, -1) : startDate;
    return { allDay: true, startDate, endDate, startTime: '09:00', endTime: '10:00' };
  }
  const startDateTime = e.start?.dateTime ?? '';
  const endDateTime = e.end?.dateTime ?? startDateTime;
  return {
    allDay: false,
    startDate: startDateTime.slice(0, 10),
    startTime: startDateTime.slice(11, 16),
    endDate: endDateTime.slice(0, 10),
    endTime: endDateTime.slice(11, 16),
  };
}

// Add — or edit — an event on any calendar the signed-in person already has
// write access to (the `options` list is pre-scoped by the caller to exclude
// read-only ones like Holidays) — attribution is stamped server-side from
// the session, not passed in here. Supports all-day, multi-day, and
// start/end time blocks, mirroring how Google Calendar itself builds an
// event resource.
export default function AddEventModal({
  options,
  initialDate,
  existing,
  showMeal,
  canEditMeal,
  mealLocationId,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  options: SharedCalendar[];
  // Prefills both start/end — from the calendar day-modal's "+ Add event",
  // which already knows which day was clicked. Falls back to today. Ignored
  // when `existing` is set (its own dates win).
  initialDate?: string;
  // The event being edited, or omit entirely to create a new one.
  existing?: CalEvent;
  // Shows that day's dinner plan (with a link to the whole week) at the top
  // of the form — only for a brand-new event, since that's what a plain day
  // click opens. `canEditMeal` gates the inline edit; setMeal is adult-only
  // server-side regardless, this just keeps the control from appearing to a
  // kid who can still add their own calendar events.
  showMeal?: boolean;
  canEditMeal?: boolean;
  mealLocationId?: string | null;
  onClose: () => void;
  onCreate?: (calendarId: string, body: EventInput) => Promise<void>;
  onUpdate?: (calendarId: string, eventId: string, body: Partial<EventInput>) => Promise<void>;
  onDelete?: (calendarId: string, eventId: string) => Promise<void>;
}) {
  const today = initialDate ?? new Date().toISOString().slice(0, 10);
  const prefill = existing ? prefillFromExisting(existing) : null;
  const [calendarId, setCalendarId] = useState(() => {
    if (existing) return existing.calendarId;
    const last = localStorage.getItem(LAST_CALENDAR_KEY);
    return last && options.some((o) => o.id === last) ? last : options[0]?.id ?? '';
  });
  const [summary, setSummary] = useState(existing?.title ?? '');
  const [allDay, setAllDay] = useState(prefill?.allDay ?? true);
  const [startDate, setStartDate] = useState(prefill?.startDate ?? today);
  const [endDate, setEndDate] = useState(prefill?.endDate ?? today);
  const [startTime, setStartTime] = useState(prefill?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(prefill?.endTime ?? '10:00');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Dinner plan for whichever day this event starts on — only for a
  // brand-new event (a day click, not editing something that already
  // exists). Refetches as the start date changes so it always matches what's
  // currently in the form, not just wherever the day click originally landed.
  const [meal, setMeal] = useState<MealPlanEntry | null>(null);
  const [editingMeal, setEditingMeal] = useState(false);
  const [mealDraft, setMealDraft] = useState('');
  const [dinnerWeekOpen, setDinnerWeekOpen] = useState(false);
  useEffect(() => {
    if (!showMeal || existing) return;
    api
      .meals(startDate, startDate, mealLocationId ?? undefined)
      .then((rows) => setMeal(rows.find((r) => !mealLocationId || r.locationId === mealLocationId) ?? rows[0] ?? null))
      .catch(() => setMeal(null));
  }, [showMeal, existing, startDate, mealLocationId]);

  async function saveMeal() {
    const title = mealDraft.trim();
    if (title) {
      const saved = await api.setMeal(startDate, { title, locationId: mealLocationId ?? null });
      setMeal(saved);
    } else if (meal) {
      await api.deleteMeal(startDate, meal.locationId ?? null);
      setMeal(null);
    }
    setEditingMeal(false);
  }

  const calendarName = options.find((o) => o.id === calendarId)?.name ?? existing?.calendarName ?? calendarId;

  function toggleAllDay(next: boolean) {
    setAllDay(next);
    if (next && endDate < startDate) setEndDate(startDate);
  }

  async function save() {
    if (!calendarId || !summary.trim()) return;
    if (endDate < startDate) {
      setErr('End date is before the start date.');
      return;
    }
    if (!allDay && endDate === startDate && endTime <= startTime) {
      setErr('End time is before the start time.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: EventInput = allDay
        ? { summary: summary.trim(), start: { date: startDate }, end: { date: addDays(endDate, 1) } }
        : {
            summary: summary.trim(),
            start: { dateTime: `${startDate}T${startTime}:00`, timeZone: TZ },
            end: { dateTime: `${endDate}T${endTime}:00`, timeZone: TZ },
          };
      if (location.trim()) body.location = location.trim();
      if (description.trim()) body.description = description.trim();
      if (existing) {
        await onUpdate?.(existing.calendarId, existing.id, body);
      } else {
        await onCreate?.(calendarId, body);
        localStorage.setItem(LAST_CALENDAR_KEY, calendarId);
      }
    } catch {
      setErr(existing ? 'Could not save changes — try again.' : 'Could not add the event — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    setErr(null);
    try {
      await onDelete?.(existing.calendarId, existing.id);
    } catch {
      setErr('Could not delete — try again.');
      setDeleting(false);
    }
  }

  return (
    <>
    <Modal
      header={<h3 className="text-lg font-semibold">{existing ? 'Edit event' : 'Add event'}</h3>}
      footer={
        <div className="flex items-center justify-between gap-2">
          {existing && onDelete && (
            <button
              onClick={remove}
              disabled={saving || deleting}
              className="rounded border px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || deleting || !calendarId || !summary.trim()}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Add event'}
            </button>
          </div>
        </div>
      }
    >
        <div className="space-y-2 text-sm">
          {showMeal && !existing && (
            <div className="alert-banner flex flex-wrap items-center gap-2 p-2 text-sm">
              <span className="shrink-0">🍽️</span>
              {editingMeal ? (
                <input
                  autoFocus
                  value={mealDraft}
                  onChange={(e) => setMealDraft(e.target.value)}
                  onBlur={saveMeal}
                  onKeyDown={(e) => e.key === 'Enter' && saveMeal()}
                  placeholder="Dinner…"
                  className="min-w-0 flex-1 rounded border px-2 py-1"
                />
              ) : (
                <button
                  disabled={!canEditMeal}
                  onClick={() => {
                    setEditingMeal(true);
                    setMealDraft(meal?.title ?? '');
                  }}
                  className="min-w-0 flex-1 truncate text-left disabled:cursor-default"
                >
                  {meal?.title ?? <span className="text-slate-400">{canEditMeal ? 'No dinner planned — tap to add' : 'No dinner planned'}</span>}
                </button>
              )}
              <button onClick={() => setDinnerWeekOpen(true)} className="shrink-0 text-xs underline hover:no-underline">
                See the week
              </button>
            </div>
          )}
          <label className="block">
            <span className="text-slate-500">Calendar</span>
            {existing ? (
              // Moving an event to a different calendar isn't supported (the
              // update call is scoped to the calendar it's already on) —
              // shown as plain text instead of a picker that would silently
              // do nothing if changed.
              <p className="mt-1 w-full rounded border bg-slate-50 px-2 py-1.5 text-slate-600">{calendarName}</p>
            ) : (
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5"
              >
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="text-slate-500">Title</span>
            <input
              autoFocus
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
              placeholder="e.g. Dentist appointment"
            />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
            <span className="text-slate-500">All day</span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="text-slate-500">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="mt-1 w-full rounded border px-2 py-1.5"
              />
            </label>
            {!allDay && (
              <label className="flex-1">
                <span className="text-slate-500">Start time</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStartTime(next);
                    if (endDate === startDate && endTime <= next) setEndTime(addMinutes(next, 60));
                  }}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </label>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="text-slate-500">End date</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setEndDate(next);
                  if (next === startDate && endTime <= startTime) setEndTime(addMinutes(startTime, 60));
                }}
                className="mt-1 w-full rounded border px-2 py-1.5"
              />
            </label>
            {!allDay && (
              <label className="flex-1">
                <span className="text-slate-500">End time</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-slate-500">Location (optional)</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-500">Notes (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={2}
            />
          </label>
          {err && <p className="text-red-500">{err}</p>}
        </div>
    </Modal>
    {dinnerWeekOpen && (
      <DinnerWeekModal
        around={startDate}
        locationId={mealLocationId}
        canEdit={!!canEditMeal}
        onClose={() => {
          setDinnerWeekOpen(false);
          // Reflect anything just changed in the week view back onto this
          // day's row without waiting for the next startDate-keyed refetch.
          api
            .meals(startDate, startDate, mealLocationId ?? undefined)
            .then((rows) => setMeal(rows.find((r) => !mealLocationId || r.locationId === mealLocationId) ?? rows[0] ?? null))
            .catch(() => undefined);
        }}
      />
    )}
    </>
  );
}
