import { useState } from 'react';
import { api, type FamilyLocation } from './api';
import Modal from './Modal';

// Blocking: shown on every authed page (never the kiosk - App.tsx is the
// only thing that mounts this, and Display.tsx is a separate render root
// that never touches App) whenever someone - any role, including kids -
// has zero location assignments in a family that actually has locations to
// offer. No backdrop-dismiss and no skip: locations gate calendars, kiosk
// displays, and Household/Store items scoped to a house, so being in none
// silently hides all of that with no obvious reason why.
export default function LocationJoinModal({ locations, onJoined }: { locations: FamilyLocation[]; onJoined: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function join() {
    if (!picked.size) return;
    setSaving(true);
    setError(null);
    try {
      await api.selfJoinLocations([...picked]);
      onJoined();
    } catch {
      setError('Could not save - try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      header={<h2 className="text-lg font-semibold">Which house are you part of?</h2>}
      footer={
        <div className="flex items-center justify-end gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button
            onClick={join}
            disabled={!picked.size || saving}
            className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {saving ? 'Joining…' : 'Join'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-500">
        This family is split into locations (usually separate houses). A location controls which calendars, kiosk
        displays, and Household items (dinner plans, groceries, and the rest) you see - only ones for a house you're
        actually part of. Pick every house that's yours; you can change this later in My Account.
      </p>
      <ul className="mt-4 space-y-2">
        {locations.map((l) => (
          <li key={l.id}>
            <label className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4" />
              <span className="font-medium">🏠 {l.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-400">You can pick more than one. At least one is required to continue.</p>
    </Modal>
  );
}
