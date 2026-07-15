import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  api,
  type Me,
  type Member,
  type SharedCalendar,
  type DisplayConfig,
  type FamilyLocation,
} from '../api';
import MembersManager from '../MembersManager';
import DisplayAccess from '../DisplayAccess';
import { useDialog } from '../Dialog';

export default function SettingsPage({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  const isAdult = me.role === 'OWNER' || me.role === 'ADULT';
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">Settings</h2>

      {isOwner && <TokenNameSetting />}
      {isOwner && <ChoreWordSetting />}

      {isAdult && (
        <Section title="Family members & invites">
          <MembersManager me={me} />
        </Section>
      )}

      <Section title="Locations (for split households)">
        <LocationsSetting />
      </Section>

      {isOwner && (
        <Section title="Touch displays">
          <DisplaysManager />
          <div className="mt-4">
            <DisplayAccess />
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Call our reward currency:</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded border px-2 py-1" />
        <span className="text-slate-500">Icon:</span>
        <select value={icon} onChange={(e) => setIcon(e.target.value)} className="rounded border px-2 py-1 text-lg">
          {TOKEN_ICONS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <span className="text-slate-500">
          1 {icon} {name} = $
        </span>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={valueUsd}
          onChange={(e) => setValueUsd(Number(e.target.value))}
          className="w-20 rounded border px-2 py-1"
        />
        <button onClick={save} className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-700">
          Save
        </button>
        {saved && <span className="text-green-600">Saved</span>}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        The $ value is used to suggest a token cost for prizes based on their real price (rounded down).
      </p>
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Call chores:</span>
        <input value={word} onChange={(e) => setWord(e.target.value)} className="rounded border px-2 py-1" placeholder="Chore" />
        <button onClick={save} className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-700">
          Save
        </button>
        {saved && <span className="text-green-600">Saved</span>}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Used everywhere "chore" shows up — try something like "Quest" or "Task" to put the focus on earning instead.
      </p>
    </Section>
  );
}

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

  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom's house" className="rounded border px-2 py-1" />
        <button onClick={add} className="rounded border px-3 py-1 hover:bg-slate-50">
          Add location
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {locations.map((loc) => {
          const assigned = new Set(loc.users.map((u) => u.userId));
          return (
            <li key={loc.id} className="rounded border p-2">
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
              <div className="mt-1 flex flex-wrap gap-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={assigned.has(m.id)}
                      onChange={(e) => toggle(loc.id, m.id, e.target.checked)}
                    />
                    {m.displayName}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
        {locations.length === 0 && <li className="text-slate-400">No locations yet.</li>}
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
    <div className="text-sm">
      <p className="text-slate-500">
        Create a display layout per kiosk (e.g. one per house). Each shows its own calendars, features, and theme.
        Give a display a location to limit it to the people (and calendars they share) assigned to that location.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New display name (e.g. Kitchen)"
          className="rounded border px-2 py-1"
        />
        <button onClick={create} className="rounded border px-3 py-1 hover:bg-slate-50">
          Add display
        </button>
      </div>

      <ul className="mt-3 space-y-3">
        {displays.map((d) => (
          <DisplayRow key={d.id} display={d} locations={locations} onPatch={(body) => patch(d.id, body)} onDelete={() => del(d.id)} />
        ))}
        {displays.length === 0 && <li className="text-slate-400">No displays yet — add one above.</li>}
      </ul>
    </div>
  );
}

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
  const locationName = locations.find((l) => l.id === d.locationId)?.name;

  return (
    <li className="rounded border p-3">
      <div className="flex items-center justify-between">
        <input
          defaultValue={d.name}
          onBlur={(e) => e.target.value !== d.name && onPatch({ name: e.target.value })}
          className="rounded border px-2 py-1 font-medium"
        />
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">
          Delete
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-slate-500">Location:</span>
        <select
          value={d.locationId ?? ''}
          onChange={(e) => onPatch({ locationId: e.target.value || null })}
          className="rounded border px-1 py-0.5"
        >
          <option value="">All family members</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-2 text-slate-500">
        Calendars{locationName ? ` shared by ${locationName}` : ''}:
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {calendars.map((c) => (
          <label key={c.id} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={cals.has(c.id)}
              onChange={(e) => {
                const n = new Set(cals);
                if (e.target.checked) n.add(c.id);
                else n.delete(c.id);
                onPatch({ calendarIds: [...n] });
              }}
            />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
            {c.name}
          </label>
        ))}
        {calendars.length === 0 && (
          <span className="text-xs text-slate-400">
            {d.locationId ? 'No calendars shared by anyone at this location.' : 'Add calendars first.'}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {['calendar', 'chores', 'prizes'].map((f) => (
          <label key={f} className="flex items-center gap-1 text-xs capitalize">
            <input
              type="checkbox"
              checked={feats.has(f)}
              onChange={(e) => {
                const n = new Set(feats);
                if (e.target.checked) n.add(f);
                else n.delete(f);
                onPatch({ enabledFeatures: [...n] });
              }}
            />
            {f}
          </label>
        ))}
        <label className="flex items-center gap-1 text-xs">
          Theme:
          <select value={d.theme} onChange={(e) => onPatch({ theme: e.target.value })} className="rounded border px-1 py-0.5">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs">
          Text size:
          <select
            value={d.fontSize}
            onChange={(e) => onPatch({ fontSize: e.target.value as DisplayConfig['fontSize'] })}
            className="rounded border px-1 py-0.5"
          >
            <option value="sm">Small</option>
            <option value="md">Normal</option>
            <option value="lg">Large</option>
            <option value="xl">Extra large</option>
          </select>
        </label>
      </div>
    </li>
  );
}
