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

export default function SettingsPage({ me }: { me: Me }) {
  const isOwner = me.role === 'OWNER';
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">Settings</h2>

      {isOwner && <TokenNameSetting />}

      {isOwner && (
        <Section title="Family members & invites">
          <MembersManager />
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
    <section className="rounded border p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TokenNameSetting() {
  const [name, setName] = useState('Tokens');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.familySettings().then((f) => setName(f.tokenName)).catch(() => undefined);
  }, []);
  async function save() {
    await api.updateFamilySettings({ tokenName: name });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <Section title="Reward name">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Call our reward currency:</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded border px-2 py-1" />
        <button onClick={save} className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-700">
          Save
        </button>
        {saved && <span className="text-green-600">Saved</span>}
      </div>
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
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);
  const [newName, setNewName] = useState('');

  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([api.listDisplays(), api.sharedCalendars()]);
    setDisplays(d);
    setCalendars(c);
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
    if (window.confirm('Delete this display?')) {
      await api.deleteDisplay(id);
      await refresh();
    }
  }

  return (
    <div className="text-sm">
      <p className="text-slate-500">
        Create a display layout per kiosk (e.g. one per house). Each shows its own calendars, features, and theme.
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
        {displays.map((d) => {
          const cals = new Set(d.calendarIds);
          const feats = new Set(d.enabledFeatures);
          return (
            <li key={d.id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <input
                  defaultValue={d.name}
                  onBlur={(e) => e.target.value !== d.name && patch(d.id, { name: e.target.value })}
                  className="rounded border px-2 py-1 font-medium"
                />
                <button onClick={() => del(d.id)} className="text-xs text-red-500 hover:text-red-700">
                  Delete
                </button>
              </div>

              <p className="mt-2 text-slate-500">Calendars:</p>
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
                        patch(d.id, { calendarIds: [...n] });
                      }}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
                    {c.name}
                  </label>
                ))}
                {calendars.length === 0 && <span className="text-xs text-slate-400">Add calendars first.</span>}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                {['calendar', 'chores'].map((f) => (
                  <label key={f} className="flex items-center gap-1 text-xs capitalize">
                    <input
                      type="checkbox"
                      checked={feats.has(f)}
                      onChange={(e) => {
                        const n = new Set(feats);
                        if (e.target.checked) n.add(f);
                        else n.delete(f);
                        patch(d.id, { enabledFeatures: [...n] });
                      }}
                    />
                    {f}
                  </label>
                ))}
                <label className="flex items-center gap-1 text-xs">
                  Theme:
                  <select value={d.theme} onChange={(e) => patch(d.id, { theme: e.target.value })} className="rounded border px-1 py-0.5">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>
            </li>
          );
        })}
        {displays.length === 0 && <li className="text-slate-400">No displays yet — add one above.</li>}
      </ul>
    </div>
  );
}
