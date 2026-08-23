import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  COLOR_THEMES,
  type Me,
  type Member,
  type SharedCalendar,
  type DisplayConfig,
  type FamilyLocation,
} from '../api';
import { CalendarFilterDropdown } from './CalendarPage';
import MembersManager from '../MembersManager';
import DisplayAccess from '../DisplayAccess';
import OwnerFamiliesPanel from '../OwnerFamiliesPanel';
import HolidaysPanel from '../HolidaysPanel';
import UpdatesPanel from '../UpdatesPanel';
import FeaturesTab from './FeaturesTab';
import IconsTab from './IconsTab';
import { useDialog } from '../Dialog';
import { resizeImageFile } from '../Prize';

type TabId = 'features' | 'family' | 'calendars' | 'locations' | 'displays' | 'icons' | 'instance';

const TAB_LABELS: Record<TabId, string> = {
  features: 'Features',
  family: 'Family',
  calendars: 'Calendars',
  locations: 'Locations',
  displays: 'Displays',
  icons: 'Icons',
  instance: 'Instance',
};

// One tab rail instead of three different reveal patterns (a plain stacked
// list, an ad hoc "This family / Instance-wide" mode switch, and a nested
// border-top afterthought for Display access) - same route, same
// components underneath, no gate changes: which tabs exist is exactly the
// same isFamilyManager/isAdult/isOwner logic this page already had, just
// deciding tab membership instead of Section visibility.
export default function SettingsPage({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const isFamilyManager = isOwner || me.role === 'FAMILY_MANAGER';
  // Route itself (App.tsx) already gates /settings to isAdult - "people" and
  // "locations" tabs below need nothing tighter than that.

  const tabs: TabId[] = [
    ...(isFamilyManager ? (['features'] as TabId[]) : []),
    'family',
    ...(isFamilyManager ? (['calendars'] as TabId[]) : []),
    'locations',
    ...(isFamilyManager ? (['displays'] as TabId[]) : []),
    ...(isFamilyManager ? (['icons'] as TabId[]) : []),
    ...(isOwner ? (['instance'] as TabId[]) : []),
  ];
  // ?tab= for direct links (e.g. straight to "Instance -> App updates"
  // instead of "go to Settings, then click around") - invalid/inaccessible
  // values (a plain adult following an owner's ?tab=instance link, say)
  // fall through the existing tabs.includes() guard below same as any other
  // stale/bad tab value already did.
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>((params.get('tab') as TabId) || tabs[0]);
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  function selectTab(t: TabId) {
    setTab(t);
    setParams(t === tabs[0] ? {} : { tab: t }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Family Settings</h2>

      <div className="no-print flex flex-wrap gap-1 border-b pb-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`rounded px-3 py-1.5 text-sm ${activeTab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === 'features' && <FeaturesTab />}
        {activeTab === 'family' && <MembersManager me={me} />}
        {activeTab === 'calendars' && (
          <>
            <Section
              title="Calendar colors"
              help="The default color everyone sees for a calendar (Google or local), unless they've picked their own in My Account."
            >
              <CalendarColorsSetting />
            </Section>
            <Section
              title="Local calendars"
              help="Calendars that live in the app - no Google account needed. Give one a location to scope it to a household. Set a local calendar's color above, alongside every other calendar's."
            >
              <LocalCalendarsSetting />
            </Section>
          </>
        )}
        {activeTab === 'locations' && (
          <Section title="Locations" help="For split households - group people so calendars and displays can be scoped per house.">
            <LocationsSetting />
          </Section>
        )}
        {activeTab === 'displays' && (
          <>
            <Section title="Displays">
              <DisplaysManager />
            </Section>
            <Section title="Kiosk links" help="Mint or revoke the bearer-token links a physical kiosk actually opens.">
              <DisplayAccess />
            </Section>
          </>
        )}
        {activeTab === 'icons' && <IconsTab isOwner={isOwner} />}
        {activeTab === 'instance' && (
          <>
            <Section
              title="Families"
              help="Instance-wide: create families, move members between them, invite someone directly into one, or ghost as any account."
            >
              <OwnerFamiliesPanel />
            </Section>
            <Section
              title="Holidays"
              help="Instance-wide: the global 'Holidays' calendar every family can add to their own list. Only you can edit it."
            >
              <HolidaysPanel />
            </Section>
            <Section title="App updates" help="Check for, install, or roll back a Roost HQ update - owner only.">
              <UpdatesPanel />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {help && <p className="mt-1 text-sm text-slate-500">{help}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Consistent labeled-field shell for every form control on this page - label
// above, control below, optional help text. Matches the pattern ChoresPanel's
// forms already use, so Settings reads like the rest of the app instead of
// its own thing.
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {/* help sits under the label on phones, inline once there's room */}
      {help && <span className="mt-0.5 block text-xs text-slate-400 sm:ml-2 sm:mt-0 sm:inline">{help}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

// Real, complete IANA zone list straight from the browser - every modern
// browser (including iOS Safari 15.4+) supports this. Falls back to a short
// curated list on anything ancient enough not to.
const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];

function LocationsSetting() {
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');

  const refresh = useCallback(async () => {
    const [l, m] = await Promise.all([api.locations(), api.listUsers()]);
    setLocations(l);
    setMembers(m);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    if (!name.trim()) return;
    await api.createLocation(name.trim());
    setName('');
    await refresh();
  }
  async function toggle(locId: string, userId: string, on: boolean) {
    if (on) await api.assignLocation(locId, userId);
    else await api.unassignLocation(locId, userId);
    await refresh();
  }
  async function setTimezone(locId: string, timezone: string) {
    await api.updateLocation(locId, { timezone });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <Field label="Add a location">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="e.g. Mom's house"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <button onClick={add} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Add
          </button>
        </div>
      </Field>

      <ul className="space-y-3">
        {locations.map((loc) => {
          const assigned = new Set(loc.users.map((u) => u.userId));
          return (
            <li key={loc.id} className="card-nested rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{loc.name}</span>
                <button
                  onClick={async () => {
                    await api.deleteLocation(loc.id);
                    await refresh();
                  }}
                  className="btn-delete rounded px-2 py-0.5 text-xs"
                >
                  Delete
                </button>
              </div>

              <div className="mt-3">
                <Field label="Timezone" help='chore due dates and "missed" checks at this location use this'>
                  <select
                    value={loc.timezone}
                    onChange={(e) => setTimezone(loc.id, e.target.value)}
                    className="w-full max-w-xs rounded border px-2 py-1.5 text-sm"
                  >
                    {!TIMEZONES.includes(loc.timezone) && <option value={loc.timezone}>{loc.timezone}</option>}
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-3">
                <span className="text-xs text-slate-500">Who's here:</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const on = assigned.has(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggle(loc.id, m.id, !on)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          on ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'
                        }`}
                      >
                        {m.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
        {locations.length === 0 && <li className="text-sm text-slate-400">No locations yet.</li>}
      </ul>
    </div>
  );
}

const CALENDAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];

function LocalCalendarsSetting() {
  const { confirm } = useDialog();
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [name, setName] = useState('');

  const refresh = useCallback(async () => {
    const [c, l] = await Promise.all([api.localCalendars(), api.locations()]);
    setCalendars(c);
    setLocations(l);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    if (!name.trim()) return;
    await api.createLocalCalendar({ name: name.trim(), color: CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length] });
    setName('');
    await refresh();
  }
  async function patch(id: string, body: Partial<{ name: string; color: string; image: string | null; locationId: string | null }>) {
    await api.updateLocalCalendar(id, body);
    await refresh();
  }
  async function del(id: string, calName: string) {
    if (await confirm(`Delete "${calName}"? This deletes all its events too.`, { danger: true, confirmLabel: 'Delete' })) {
      await api.deleteLocalCalendar(id);
      await refresh();
    }
  }
  async function onPhotoFile(id: string, file: File | undefined) {
    if (!file) return;
    const dataUri = await resizeImageFile(file, 160, 0.8);
    await patch(id, { image: dataUri });
  }

  return (
    <div className="space-y-4">
      <Field label="Add a local calendar">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="e.g. Shea Family"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <button onClick={add} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Add
          </button>
        </div>
      </Field>

      <ul className="space-y-2">
        {calendars.map((c) => (
          <li key={c.id} className="card-nested flex flex-wrap items-center gap-3 rounded-lg p-3">
            <label
              title="Upload a photo so this calendar is recognizable at a glance - defaults to just the color swatch if you skip this."
              className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border"
              style={!c.image ? { background: c.color ?? '#94a3b8' } : undefined}
            >
              {c.image && <img src={c.image} alt="" className="h-full w-full object-cover" />}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onPhotoFile(c.id, e.target.files?.[0])}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            {c.image && (
              <button
                onClick={() => patch(c.id, { image: null })}
                className="text-xs text-slate-400 hover:text-slate-600"
                title="Remove photo, go back to just the color swatch"
              >
                Remove photo
              </button>
            )}
            <input
              defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && patch(c.id, { name: e.target.value.trim() })}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            />
            <select
              value={c.locationId ?? ''}
              onChange={(e) => patch(c.id, { locationId: e.target.value || null })}
              className="rounded border px-2 py-1 text-sm"
            >
              <option value="">Whole family</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button onClick={() => del(c.id, c.name)} className="btn-delete ml-auto rounded px-2 py-0.5 text-xs">
              Delete
            </button>
          </li>
        ))}
        {calendars.length === 0 && <li className="text-sm text-slate-400">No local calendars yet - add one above.</li>}
      </ul>
    </div>
  );
}

// Owner/family-manager only: the shared default color for every calendar in
// the family, Google-backed or local - one list, one control, instead of
// local calendars having their own separate (and redundant) color picker
// down in LocalCalendarsSetting below. A personal override set in My Account
// still wins over this for whoever set one; this just changes what everyone
// else sees.
function CalendarColorsSetting() {
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.sharedCalendars().then(setCalendars).catch(() => setCalendars([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setColor(id: string, color: string) {
    setSavingId(id);
    setCalendars((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
    try {
      await api.setCalendarBaseColor(id, color);
    } finally {
      setSavingId(null);
    }
  }

  // Holidays is a synthetic entry with no real row to recolor (see
  // HOLIDAYS_CALENDAR_ENTRY server-side) - skip it here.
  const editable = calendars.filter((c) => c.source !== 'holiday');

  return (
    <ul className="space-y-2">
      {editable.map((c) => (
        <li key={c.id} className="card-nested flex flex-wrap items-center gap-3 rounded-lg px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
          <span className="shrink-0 text-xs text-slate-400">{c.source === 'local' ? 'Local' : 'Google'}</span>
          <input
            type="color"
            value={c.color ?? '#94a3b8'}
            onChange={(e) => setColor(c.id, e.target.value)}
            disabled={savingId === c.id}
            className="h-8 w-10 shrink-0 cursor-pointer rounded border p-0.5"
          />
        </li>
      ))}
      {editable.length === 0 && <li className="text-sm text-slate-400">No calendars yet.</li>}
    </ul>
  );
}

function DisplaysManager() {
  const { confirm } = useDialog();
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [newName, setNewName] = useState('');

  const refresh = useCallback(async () => {
    const [d, l] = await Promise.all([api.listDisplays(), api.locations()]);
    setDisplays(d);
    setLocations(l);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    if (!newName.trim()) return;
    await api.createDisplay({ name: newName.trim(), calendarIds: [], enabledFeatures: ['calendar', 'chores'], theme: 'light' });
    setNewName('');
    await refresh();
  }
  async function patch(id: string, body: Partial<DisplayConfig>) {
    await api.updateDisplay(id, body);
    await refresh();
  }
  async function del(id: string) {
    if (await confirm('Delete this display?', { danger: true, confirmLabel: 'Delete' })) {
      await api.deleteDisplay(id);
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Create a display layout per kiosk (e.g. one per house). Each shows its own calendars, features, and theme.
        Give a display a location to limit it to the people (and calendars they share) assigned to that location.
      </p>
      <Field label="Add a display">
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. Kitchen"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <button onClick={create} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            Add
          </button>
        </div>
      </Field>

      <ul className="space-y-4">
        {displays.map((d) => (
          <DisplayRow key={d.id} display={d} locations={locations} onPatch={(body) => patch(d.id, body)} onDelete={() => del(d.id)} />
        ))}
        {displays.length === 0 && <li className="text-sm text-slate-400">No displays yet - add one above.</li>}
      </ul>
    </div>
  );
}

const FEATURES: Array<{ id: string; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'chores', label: 'Chores' },
  { id: 'prizes', label: 'Prizes' },
  { id: 'meals', label: 'Meal plan' },
  { id: 'grocery', label: 'Grocery list' },
  { id: 'countdowns', label: 'Countdowns' },
  { id: 'announcements', label: 'Announcements' },
];

function DisplayRow({
  display: d,
  locations,
  onPatch,
  onDelete,
}: {
  display: DisplayConfig;
  locations: FamilyLocation[];
  onPatch: (body: Partial<DisplayConfig>) => Promise<void>;
  onDelete: () => void;
}) {
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);
  const [reloaded, setReloaded] = useState(false);

  // Pushed over the SSE stream every kiosk on this display already holds
  // open - fixes a frozen/stuck Pi without walking over to it. Only reaches
  // a kiosk that's actually still connected; one whose display link was
  // revoked never had a live stream to push to in the first place.
  async function onReload() {
    await api.reloadDisplay(d.id);
    setReloaded(true);
    setTimeout(() => setReloaded(false), 2000);
  }

  useEffect(() => {
    api.displaysCalendars(d.locationId).then(setCalendars).catch(() => setCalendars([]));
  }, [d.locationId]);

  const cals = new Set(d.calendarIds);
  const feats = new Set(d.enabledFeatures);

  return (
    <li className="card-nested rounded-lg p-4">
      <div className="flex items-center justify-between gap-2">
        <input
          defaultValue={d.name}
          onBlur={(e) => e.target.value !== d.name && onPatch({ name: e.target.value })}
          className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm font-medium"
        />
        <button onClick={onReload} className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-slate-50" title="Reload any kiosk currently showing this display">
          {reloaded ? '✓ Sent' : '🔄 Reload kiosk'}
        </button>
        <button onClick={onDelete} className="btn-delete shrink-0 rounded px-2 py-0.5 text-xs">
          Delete
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Location">
          <select
            value={d.locationId ?? ''}
            onChange={(e) => onPatch({ locationId: e.target.value || null })}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="">All family members</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Calendars shown">
          <CalendarFilterDropdown
            options={calendars}
            visible={cals}
            onChange={(next) => onPatch({ calendarIds: [...next] })}
            label="Calendars"
          />
          {calendars.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {d.locationId ? 'No calendars shared by anyone at this location.' : 'Add calendars first.'}
            </p>
          )}
        </Field>

        <Field label="Theme">
          <select value={d.theme} onChange={(e) => onPatch({ theme: e.target.value })} className="w-full rounded border px-2 py-1.5 text-sm">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>

        <Field label="Default color theme" help="Shown whenever nobody's signed in - a signed-in person's own color still takes over.">
          <select
            value={d.colorTheme}
            onChange={(e) => onPatch({ colorTheme: e.target.value })}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            {COLOR_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Text size">
          <select
            value={d.fontSize}
            onChange={(e) => onPatch({ fontSize: e.target.value as DisplayConfig['fontSize'] })}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="sm">Small</option>
            <option value="md">Normal</option>
            <option value="lg">Large</option>
            <option value="xl">Extra large</option>
          </select>
        </Field>

        <Field label="Sound effects" help="Celebration chime when someone completes a chore on this display.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.soundEffects} onChange={(e) => onPatch({ soundEffects: e.target.checked })} />
            Play sounds
          </label>
        </Field>

        <Field label="Bedtime mode" help="Kiosk dims to a good-night screen inside this window. Leave blank to disable.">
          <div className="flex items-center gap-2 text-sm">
            <input
              type="time"
              value={d.bedtimeStart ?? ''}
              onChange={(e) => onPatch({ bedtimeStart: e.target.value || null })}
              className="rounded border px-2 py-1.5 text-sm"
            />
            <span className="text-slate-400">to</span>
            <input
              type="time"
              value={d.bedtimeEnd ?? ''}
              onChange={(e) => onPatch({ bedtimeEnd: e.target.value || null })}
              className="rounded border px-2 py-1.5 text-sm"
            />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Features">
            <div className="flex flex-wrap gap-3">
              {FEATURES.map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={feats.has(f.id)}
                    onChange={(e) => {
                      const n = new Set(feats);
                      if (e.target.checked) n.add(f.id);
                      else n.delete(f.id);
                      onPatch({ enabledFeatures: [...n] });
                    }}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Touch keyboard">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={d.onScreenKeyboard}
                onChange={(e) => onPatch({ onScreenKeyboard: e.target.checked })}
              />
              Pop up an on-screen keyboard when a text field is tapped
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Turn this on for a touchscreen kiosk with no keyboard attached; leave it off if one's plugged in.
            </p>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Screensaver">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Show a full-screen clock after</span>
              <input
                type="number"
                min={0}
                defaultValue={d.screensaverMinutes}
                onBlur={(e) => {
                  const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  if (n !== d.screensaverMinutes) onPatch({ screensaverMinutes: n });
                }}
                className="w-20 rounded border px-2 py-1"
              />
              <span className="text-slate-500">idle minutes (0 = never) - tap anywhere to wake it</span>
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Weather (shown by the date, and on the screensaver)">
            <input
              defaultValue={d.weatherLocation ?? ''}
              placeholder="e.g. Phoenix, AZ"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (d.weatherLocation ?? '')) onPatch({ weatherLocation: v || null });
              }}
              className="w-full max-w-xs rounded border px-3 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">Leave blank to hide weather entirely on this display.</p>
          </Field>
        </div>
      </div>
    </li>
  );
}
