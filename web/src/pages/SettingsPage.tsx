import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  api,
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
import { useDialog } from '../Dialog';

export default function SettingsPage({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const isFamilyManager = isOwner || me.role === 'FAMILY_MANAGER';
  const isAdult = isFamilyManager || me.role === 'ADULT';
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {isOwner && (
        <Section
          title="Families"
          help="Instance-wide: create families, move members between them, invite someone directly into one, or ghost as any account."
        >
          <OwnerFamiliesPanel />
        </Section>
      )}

      {isOwner && (
        <Section
          title="Holidays"
          help="Instance-wide: the global 'Holidays' calendar every family can add to their own list. Only you can edit it."
        >
          <HolidaysPanel />
        </Section>
      )}

      {isFamilyManager && <TokenNameSetting />}
      {isFamilyManager && <ChoreWordSetting />}

      {isAdult && (
        <Section title="Family members & invites">
          <MembersManager me={me} />
        </Section>
      )}

      <Section title="Locations" help="For split households — group people so calendars and displays can be scoped per house.">
        <LocationsSetting />
      </Section>

      {isAdult && (
        <Section
          title="Local calendars"
          help="Calendars that live in the app — no Google account needed. Give one a location to scope it to a household."
        >
          <LocalCalendarsSetting />
        </Section>
      )}

      {isFamilyManager && (
        <Section title="Touch displays">
          <DisplaysManager />
          <div className="mt-6 border-t pt-4">
            <DisplayAccess />
          </div>
        </Section>
      )}
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

// Consistent labeled-field shell for every form control on this page — label
// above, control below, optional help text. Matches the pattern ChoresPanel's
// forms already use, so Settings reads like the rest of the app instead of
// its own thing.
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {help && <span className="ml-2 text-xs text-slate-400">{help}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function SaveButton({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onClick} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
        Save
      </button>
      {saved && <span className="text-sm text-green-600">Saved</span>}
    </div>
  );
}

const TOKEN_ICONS = ['🪙', '💰', '💎', '⭐', '🎫', '🎟️', '🏆', '🍬', '🔶', '🟡', '❤️', '🎁'];

function TokenNameSetting() {
  const [name, setName] = useState('Tokens');
  const [icon, setIcon] = useState('🪙');
  const [valueUsd, setValueUsd] = useState(1);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.familySettings().then((f) => {
      setName(f.tokenName);
      setIcon(f.tokenIcon);
      setValueUsd(f.tokenValueUsd);
    }).catch(() => undefined);
  }, []);
  async function save() {
    await api.updateFamilySettings({ tokenName: name, tokenIcon: icon, tokenValueUsd: valueUsd });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <Section title="Reward name">
      <div className="space-y-4">
        <Field label="What do you call your reward currency?">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-xs rounded border px-3 py-1.5 text-sm"
          />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Field label="Icon">
            <select value={icon} onChange={(e) => setIcon(e.target.value)} className="rounded border px-2 py-1.5 text-lg">
              {TOKEN_ICONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
          <Field label="1 unit = how many dollars?" help={`e.g. 1 ${icon} ${name || 'Tokens'} = $${valueUsd || 0}`}>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={valueUsd}
              onChange={(e) => setValueUsd(Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              className="w-24 rounded border px-3 py-1.5 text-sm"
            />
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          The $ value is used to suggest a token cost for prizes based on their real price (rounded down).
        </p>
        <SaveButton onClick={save} saved={saved} />
      </div>
    </Section>
  );
}

function ChoreWordSetting() {
  const [word, setWord] = useState('Chore');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.familySettings().then((f) => setWord(f.choreWord)).catch(() => undefined);
  }, []);
  async function save() {
    await api.updateFamilySettings({ choreWord: word });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <Section title="Chore language">
      <div className="space-y-4">
        <Field label="What do you call chores?" help='try "Quest" or "Task" to put the focus on earning'>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Chore"
            className="w-full max-w-xs rounded border px-3 py-1.5 text-sm"
          />
        </Field>
        <SaveButton onClick={save} saved={saved} />
      </div>
    </Section>
  );
}

// Real, complete IANA zone list straight from the browser — every modern
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
          <button onClick={add} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            Add
          </button>
        </div>
      </Field>

      <ul className="space-y-3">
        {locations.map((loc) => {
          const assigned = new Set(loc.users.map((u) => u.userId));
          return (
            <li key={loc.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{loc.name}</span>
                <button
                  onClick={async () => {
                    await api.deleteLocation(loc.id);
                    await refresh();
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
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
  async function patch(id: string, body: Partial<{ name: string; color: string; locationId: string | null }>) {
    await api.updateLocalCalendar(id, body);
    await refresh();
  }
  async function del(id: string, calName: string) {
    if (await confirm(`Delete "${calName}"? This deletes all its events too.`, { danger: true, confirmLabel: 'Delete' })) {
      await api.deleteLocalCalendar(id);
      await refresh();
    }
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
          <button onClick={add} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            Add
          </button>
        </div>
      </Field>

      <ul className="space-y-2">
        {calendars.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <input
              type="color"
              value={c.color ?? '#94a3b8'}
              onChange={(e) => patch(c.id, { color: e.target.value })}
              className="h-7 w-7 shrink-0 cursor-pointer rounded border"
            />
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
            <button onClick={() => del(c.id, c.name)} className="ml-auto text-xs text-red-500 hover:text-red-700">
              Delete
            </button>
          </li>
        ))}
        {calendars.length === 0 && <li className="text-sm text-slate-400">No local calendars yet — add one above.</li>}
      </ul>
    </div>
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
          <button onClick={create} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            Add
          </button>
        </div>
      </Field>

      <ul className="space-y-4">
        {displays.map((d) => (
          <DisplayRow key={d.id} display={d} locations={locations} onPatch={(body) => patch(d.id, body)} onDelete={() => del(d.id)} />
        ))}
        {displays.length === 0 && <li className="text-sm text-slate-400">No displays yet — add one above.</li>}
      </ul>
    </div>
  );
}

const FEATURES: Array<{ id: string; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'chores', label: 'Chores' },
  { id: 'prizes', label: 'Prizes' },
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

  useEffect(() => {
    api.displaysCalendars(d.locationId).then(setCalendars).catch(() => setCalendars([]));
  }, [d.locationId]);

  const cals = new Set(d.calendarIds);
  const feats = new Set(d.enabledFeatures);

  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <input
          defaultValue={d.name}
          onBlur={(e) => e.target.value !== d.name && onPatch({ name: e.target.value })}
          className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm font-medium"
        />
        <button onClick={onDelete} className="shrink-0 text-xs text-red-500 hover:text-red-700">
          Delete
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <span className="text-slate-500">idle minutes (0 = never) — tap anywhere to wake it</span>
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
