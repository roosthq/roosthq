import { useState } from 'react';
import { api, type MyPresence, type PresenceStatus } from './api';
import Modal from './Modal';
import LucideIcon from './LucideIcon';

// #9 - "where are you right now." One big tappable card per place someone
// could be: their household(s), or "Away"/"Vacation" for not-at-any-of-them.
// Deliberately card-grid, not a form - this has to work for a kid tapping it
// on a kiosk just as easily as an adult in Settings, so no typing, ever.
export default function PresenceModal({
  displayName,
  current,
  kioskToken,
  targetUserId,
  onSaved,
  onClose,
  dismissible = true,
}: {
  displayName: string;
  current: MyPresence;
  // Kiosk-token session (the kiosk's own "I'm here/I'm back" card) or an
  // adult setting a kid's status directly, without ghosting. Omit both for
  // "set my own status" from the main app.
  kioskToken?: string;
  targetUserId?: string;
  onSaved: (next: MyPresence) => void;
  onClose?: () => void;
  dismissible?: boolean;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(status: PresenceStatus, locationId?: string) {
    const key = status === 'HOME' && locationId ? locationId : status;
    setSaving(key);
    setError(null);
    try {
      const body = { status, locationId };
      const next = targetUserId ? await api.setPresenceFor(targetUserId, body) : await api.setPresence(body, kioskToken);
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save - try again.');
    } finally {
      setSaving(null);
    }
  }

  const singleLocation = current.locations.length === 1 ? current.locations[0] : null;
  const isCurrentHome = (locationId?: string) =>
    current.status === 'HOME' && (locationId ? current.locationId === locationId : true);

  function Card({
    active,
    iconSlot,
    iconKey,
    label,
    sub,
    busyKey,
    onClick,
  }: {
    active: boolean;
    iconSlot: string;
    iconKey: string;
    label: string;
    sub?: string;
    busyKey: string;
    onClick: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        disabled={saving !== null}
        className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-5 text-center transition disabled:opacity-60 ${
          active ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
        }`}
        style={active ? { borderColor: 'var(--accent)', background: 'var(--surface-off)' } : undefined}
      >
        <LucideIcon name={iconKey} slot={iconSlot} size={36} />
        <span className="text-base font-semibold">{saving === busyKey ? 'Saving…' : label}</span>
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
        {active && <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Current</span>}
      </button>
    );
  }

  return (
    <Modal
      header={<h2 className="text-lg font-semibold">Where's {displayName}?</h2>}
      onBackdropClick={dismissible ? onClose : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          {dismissible && (
            <button onClick={onClose} className="ml-auto rounded border px-4 py-2 text-sm hover:bg-slate-50">
              Close
            </button>
          )}
        </div>
      }
    >
      <p className="text-sm text-slate-500">
        This decides whether chores here stay active for {displayName} today. Away or on vacation excuses chores
        instead of marking them missed - no lost streaks for a sleepover, a trip, or staying at the other house.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {current.locations.length > 1 ? (
          current.locations.map((l) => (
            <Card
              key={l.id}
              active={isCurrentHome(l.id)}
              iconSlot="badge.presenceHome"
              iconKey="house"
              label={l.name}
              sub="I'm here"
              busyKey={l.id}
              onClick={() => pick('HOME', l.id)}
            />
          ))
        ) : (
          <Card
            active={isCurrentHome()}
            iconSlot="badge.presenceHome"
            iconKey="house"
            label="Home"
            sub={singleLocation?.name}
            busyKey="HOME"
            onClick={() => pick('HOME', singleLocation?.id)}
          />
        )}
        <Card
          active={current.status === 'AWAY'}
          iconSlot="badge.presenceAway"
          iconKey="moon"
          label="Away"
          sub="Back soon"
          busyKey="AWAY"
          onClick={() => pick('AWAY')}
        />
        <Card
          active={current.status === 'VACATION'}
          iconSlot="badge.presenceVacation"
          iconKey="plane"
          label="Vacation"
          sub="Fully out"
          busyKey="VACATION"
          onClick={() => pick('VACATION')}
        />
      </div>
    </Modal>
  );
}
