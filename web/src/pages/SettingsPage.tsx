import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  api,
  type Me,
  type Member,
  type SharedCalendar,
  type DisplaySettings,
  type FamilyLocation,
} from '../api';
import MembersManager from '../MembersManager';
import DisplayAccess from '../DisplayAccess';

const FEATURES = ['calendar', 'chores', 'tokens', 'prizes'];

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
        <Section title="Touch display">
          <DisplaySettingsEditor />
          <div className="mt-3">
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

function DisplaySettingsEditor() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([api.displaySettings(), api.sharedCalendars()]);
    setSettings(s);
    setCalendars(c);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!settings) return <p className="text-sm text-slate-400">Loading…</p>;

  async function save(patch: Partial<DisplaySettings>) {
    const updated = await api.updateDisplaySettings(patch);
    setSettings(updated);
  }

  const defaults = new Set(settings.defaultCalendarIds);
  const features = new Set(settings.enabledFeatures);

  return (
    <div className="text-sm">
      <p className="text-slate-500">Calendars shown on the wall display:</p>
      <div className="mt-1 flex flex-wrap gap-3">
        {calendars.map((c) => (
          <label key={c.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={defaults.has(c.id)}
              onChange={(e) => {
                const next = new Set(defaults);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                save({ defaultCalendarIds: [...next] });
              }}
            />
            <span className="h-3 w-3 rounded-full" style={{ background: c.color ?? '#94a3b8' }} />
            {c.name}
          </label>
        ))}
      </div>

      <p className="mt-3 text-slate-500">Features enabled on the display:</p>
      <div className="mt-1 flex flex-wrap gap-3">
        {FEATURES.map((f) => (
          <label key={f} className="flex items-center gap-1 capitalize">
            <input
              type="checkbox"
              checked={features.has(f)}
              onChange={(e) => {
                const next = new Set(features);
                if (e.target.checked) next.add(f);
                else next.delete(f);
                save({ enabledFeatures: [...next] });
              }}
            />
            {f}
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-slate-500">Theme:</span>
        <select
          value={settings.theme}
          onChange={(e) => save({ theme: e.target.value })}
          className="rounded border px-2 py-1"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </div>
  );
}
