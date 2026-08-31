import { useCallback, useEffect, useState } from 'react';
import { api, loginUrl, type FamilyLocation, type GoogleCalendar, type SharedCalendar } from './api';
import { useDialog } from './Dialog';
import Modal from './Modal';

// "My Account" -> Calendars: a personal color override per calendar (native
// color input - a calendar's color is already a freeform hex, same as what
// Google or a local calendar's creator picked, so there's no fixed palette
// to match here like the profile theme swatches use) plus the same
// share/unshare management the Calendar page's "Manage calendars" offers.
// Self-contained (fetches its own calendar list) so it doesn't depend on the
// Calendar page's internal state at all.
export default function CalendarsSettingsSection({ isAdult }: { isAdult: boolean }) {
  const { alert } = useDialog();
  const [shared, setShared] = useState<SharedCalendar[]>([]);
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [picker, setPicker] = useState<GoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingLocId, setSavingLocId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // Scoped to my own location(s) - a person at one house shouldn't have to
    // wade through every calendar shared by every other house in the family
    // just to color their own.
    api.myCalendars().then(setShared).catch(() => setShared([]));
    api.locations().then(setLocations).catch(() => setLocations([]));
  }, []);
  useEffect(() => {
    refresh();
    api.googleAccountStatus().then((s) => setNeedsReconnect(s.needsReconnect)).catch(() => undefined);
  }, [refresh]);

  // Where a calendar I share shows up - not gated to family managers (see
  // PLANNING.md §16): whoever actually shares a calendar gets to say where
  // it's visible, full stop. Only shown for calendars I share myself -
  // setLocationShares enforces the same rule server-side, so this just
  // avoids offering a control that would 403.
  async function toggleLocation(calendarId: string, locationId: string, on: boolean) {
    const cal = shared.find((c) => c.id === calendarId);
    if (!cal) return;
    const current = new Set(cal.locationIds ?? []);
    if (on) current.add(locationId);
    else current.delete(locationId);
    const next = [...current];
    setSavingLocId(calendarId);
    setShared((prev) => prev.map((c) => (c.id === calendarId ? { ...c, locationIds: next } : c)));
    try {
      await api.setCalendarLocations(calendarId, next);
    } catch {
      refresh();
    } finally {
      setSavingLocId(null);
    }
  }

  async function setColor(calendarId: string, color: string) {
    setSavingId(calendarId);
    setShared((prev) => prev.map((c) => (c.id === calendarId ? { ...c, color } : c)));
    try {
      await api.setCalendarColor(calendarId, color);
    } catch {
      refresh(); // roll back to the real state if the save failed
    } finally {
      setSavingId(null);
    }
  }

  async function resetColor(calendarId: string) {
    setSavingId(calendarId);
    try {
      await api.setCalendarColor(calendarId, null);
    } finally {
      setSavingId(null);
      refresh(); // pick back up the calendar's own underlying color
    }
  }

  async function openPicker() {
    try {
      const cals = await api.googleCalendars();
      setPicker(cals);
      setPicked(new Set(shared.filter((c) => c.sharedByMe && c.googleCalendarId).map((c) => c.googleCalendarId as string)));
    } catch {
      const s = await api.googleAccountStatus().catch(() => ({ needsReconnect: false }));
      setNeedsReconnect(s.needsReconnect);
      await alert(
        s.needsReconnect
          ? "A connected Google account needs to be reconnected before calendars can be managed - see the banner above."
          : "Couldn't load your Google calendars - try again in a moment.",
      );
    }
  }

  async function doShare() {
    if (!picker) return;
    const pickerIds = new Set(picker.map((c) => c.googleCalendarId));
    const alreadyMineIds = new Set(shared.filter((c) => c.sharedByMe && c.googleCalendarId).map((c) => c.googleCalendarId as string));

    const byAccount = new Map<string, GoogleCalendar[]>();
    for (const c of picker) {
      if (!picked.has(c.googleCalendarId) || alreadyMineIds.has(c.googleCalendarId)) continue;
      const arr = byAccount.get(c.googleAccountId) ?? [];
      arr.push(c);
      byAccount.set(c.googleAccountId, arr);
    }
    for (const [accountId, cals] of byAccount) {
      await api.share(accountId, cals.map((c) => ({ googleCalendarId: c.googleCalendarId, name: c.name, color: c.color })));
    }

    const toRemove = [...alreadyMineIds].filter((id) => pickerIds.has(id) && !picked.has(id));
    await Promise.all(toRemove.map((id) => api.unshare(id)));

    setPicker(null);
    refresh();
  }

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">Calendars</h3>
          <p className="mt-1 text-sm text-slate-500">
            Pick your own color for each calendar - it only changes how it looks for you, not for anyone else.
          </p>
        </div>
        {isAdult && (
          <div className="flex flex-wrap gap-2">
            <a href={`${loginUrl}?mode=self`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              + Connect Google
            </a>
            <button onClick={openPicker} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              Manage calendars
            </button>
          </div>
        )}
      </div>

      {needsReconnect && (
        <p className="alert-banner mt-3 rounded p-2 text-sm">
          A connected Google account's calendar access expired - reconnect it from the Calendar page to see its
          calendars here again.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {shared.map((c) => (
          <li key={c.id} className="card-nested rounded-lg px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1 break-words text-sm font-medium">{c.name}</span>
              <input
                type="color"
                value={c.color ?? '#94a3b8'}
                onChange={(e) => setColor(c.id, e.target.value)}
                disabled={savingId === c.id}
                title="Pick a color"
                className="h-8 w-10 shrink-0 cursor-pointer rounded border p-0.5"
              />
              <button
                onClick={() => resetColor(c.id)}
                disabled={savingId === c.id}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
                title="Reset to this calendar's own color"
              >
                Reset
              </button>
            </div>
            {/* Only for a calendar I share myself - anyone who shares a
                calendar gets to say where it's visible, not just family
                managers (PLANNING.md §16). setLocationShares enforces the
                same rule server-side; this just doesn't offer a control
                that would 403 for a calendar I don't own. */}
            {c.sharedByMe && c.source === 'google' && locations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">Visible at:</span>
                {locations.map((l) => {
                  const on = (c.locationIds ?? []).includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLocation(c.id, l.id, !on)}
                      disabled={savingLocId === c.id}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                    >
                      {l.name}
                    </button>
                  );
                })}
                {!(c.locationIds ?? []).length && <span className="text-xs text-slate-400">whole family</span>}
              </div>
            )}
          </li>
        ))}
        {shared.length === 0 && <li className="text-sm text-slate-400">No calendars yet.</li>}
      </ul>

      {picker && (
        <Modal
          header={<h3 className="text-lg font-semibold">Add or remove calendars</h3>}
          onBackdropClick={() => setPicker(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setPicker(null)} className="rounded border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={doShare} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                Save
              </button>
            </div>
          }
        >
          <ul className="space-y-1">
            {picker.map((c) => (
              <li key={c.googleCalendarId}>
                <label className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={picked.has(c.googleCalendarId)}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.googleCalendarId);
                        else next.delete(c.googleCalendarId);
                        return next;
                      })
                    }
                  />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
                  <span className="min-w-0 flex-1 break-words">{c.name}</span>
                  {c.primary && <span className="text-xs text-slate-400">primary</span>}
                </label>
              </li>
            ))}
            {picker.length === 0 && <li className="text-sm text-slate-400">No calendars found on your Google account.</li>}
          </ul>
        </Modal>
      )}
    </section>
  );
}
