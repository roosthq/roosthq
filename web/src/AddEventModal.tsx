import { useState } from 'react';
import type { EventInput, SharedCalendar } from './api';
import Modal from './Modal';

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

// Add an event to any calendar the signed-in person already has access to
// (the `options` list is pre-scoped by the caller) — attribution is stamped
// server-side from the session, not passed in here. Supports all-day,
// multi-day, and start/end time blocks, mirroring how Google Calendar itself
// builds an event resource.
export default function AddEventModal({
  options,
  initialDate,
  onClose,
  onCreate,
}: {
  options: SharedCalendar[];
  // Prefills both start/end — from the calendar day-modal's "+ Add event",
  // which already knows which day was clicked. Falls back to today.
  initialDate?: string;
  onClose: () => void;
  onCreate: (calendarId: string, body: EventInput) => Promise<void>;
}) {
  const today = initialDate ?? new Date().toISOString().slice(0, 10);
  const [calendarId, setCalendarId] = useState(options[0]?.id ?? '');
  const [summary, setSummary] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      await onCreate(calendarId, body);
    } catch {
      setErr('Could not add the event — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      header={<h3 className="text-lg font-semibold">Add event</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !calendarId || !summary.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add event'}
          </button>
        </div>
      }
    >
        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="text-slate-500">Calendar</span>
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
  );
}
