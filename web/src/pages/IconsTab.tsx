import { useEffect, useMemo, useState } from 'react';
import { api, type IconSettingsResponse, type SlotPick } from '../api';
import LucideIcon from '../LucideIcon';
import IconGridPicker from '../icons/IconGridPicker';
import { ICON_SLOTS, type IconSlot } from '../icons/slots';
import type { IconSetName } from '../icons/catalog';
import Modal from '../Modal';
import { refreshIconSettings } from '../icons/settingsStore';

const CATEGORY_ORDER = ['Navigation', 'Roles', 'Badges', 'Chores', 'Kiosk', 'Household', 'Search', 'Store', 'Notifications', 'Reward games'];

function PickerModal({ slot, onClose, onPick }: { slot: IconSlot; onClose: () => void; onPick: (pick: SlotPick) => void }) {
  const [activeStyle, setActiveStyle] = useState<IconSetName>('NOTO');
  return (
    <Modal header={<h3 className="text-base font-semibold">Pick an icon for "{slot.label}"</h3>} onBackdropClick={onClose}>
      <IconGridPicker
        activeStyle={activeStyle}
        onStyleChange={setActiveStyle}
        onPick={(key, set) => {
          onPick({ iconKey: key, iconSet: set });
          onClose();
        }}
      />
    </Modal>
  );
}

function SlotRow({
  slot,
  pick,
  onPick,
  onReset,
  busy,
}: {
  slot: IconSlot;
  pick: SlotPick | undefined;
  onPick: (pick: SlotPick) => void;
  onReset: () => void;
  busy: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const renderName = pick ? `${pick.iconSet}:${pick.iconKey}` : slot.defaultKey;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <LucideIcon name={renderName} size={28} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{slot.label}</div>
        {!pick && <div className="text-xs text-slate-400">Using default</div>}
      </div>
      <div className="flex shrink-0 gap-1">
        <button disabled={busy} onClick={() => setPickerOpen(true)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-slate-50">
          Change
        </button>
        {pick && (
          <button disabled={busy} onClick={onReset} className="rounded-full border px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
            Use default
          </button>
        )}
      </div>
      {pickerOpen && <PickerModal slot={slot} onClose={() => setPickerOpen(false)} onPick={onPick} />}
    </div>
  );
}

// Settings -> Family -> Icons. Family Manager+ picks, for EACH named UI
// position (Calendar tab, Announcements, a role badge, a notification
// type...), any icon from the whole catalog in any style - not just a style
// variant of that position's own default concept. The instance owner gets a
// second scope underneath setting the platform-wide pick every OTHER family
// inherits (unless they've picked their own here). Both write through the
// exact same resolve chain LucideIcon reads at render time (family -> app ->
// the slot's own hardcoded default), so a change is visible everywhere that
// position appears, app+kiosk both, immediately.
export default function IconsTab({ isOwner }: { isOwner: boolean }) {
  const [data, setData] = useState<IconSettingsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [scope, setScope] = useState<'family' | 'platform'>('family');

  const refresh = () => api.iconSettings().then(setData).catch(() => undefined);
  useEffect(() => {
    refresh();
  }, []);

  const overrides = scope === 'family' ? data?.familySlots : data?.appSlots;

  async function setSlot(slotId: string, pick: SlotPick | null) {
    setBusySlot(slotId);
    try {
      if (scope === 'family') await api.setFamilySlotIcon(slotId, pick);
      else await api.setAppSlotIcon(slotId, pick);
      await refresh();
      refreshIconSettings(); // live-update every <LucideIcon/> already on screen
    } finally {
      setBusySlot(null);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? ICON_SLOTS.filter((s) => s.label.toLowerCase().includes(q)) : ICON_SLOTS;
  const byCategory = useMemo(() => {
    const m = new Map<string, IconSlot[]>();
    for (const s of filtered) {
      if (!m.has(s.category)) m.set(s.category, []);
      m.get(s.category)!.push(s);
    }
    return m;
  }, [filtered]);
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  if (!data) return <p className="text-sm text-slate-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Pick any icon - any style - for each of these. Not just a different look for the same icon: the Calendar tab can be a smiley face if you want
        it to be. Changes apply everywhere that spot shows up, app and kiosk both, right away.
      </p>
      {isOwner && (
        <div className="flex gap-1 border-b pb-2 text-sm">
          <button onClick={() => setScope('family')} className={`rounded px-3 py-1 ${scope === 'family' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}>
            This family
          </button>
          <button
            onClick={() => setScope('platform')}
            className={`rounded px-3 py-1 ${scope === 'platform' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
          >
            Platform default
          </button>
        </div>
      )}
      {scope === 'platform' && (
        <p className="text-xs text-slate-400">Sets the default every family inherits unless they've picked their own here under "This family".</p>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search positions (Calendar, Announcements, Stats...)"
        className="w-full rounded border px-3 py-2 text-sm sm:max-w-xs"
      />
      <div className="space-y-5">
        {categories.map((cat) => (
          <div key={cat}>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat}</h4>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {byCategory.get(cat)!.map((slot) => (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  pick={overrides?.[slot.id]}
                  onPick={(pick) => setSlot(slot.id, pick)}
                  onReset={() => setSlot(slot.id, null)}
                  busy={busySlot === slot.id}
                />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-400">No positions match "{query}".</p>}
      </div>
    </div>
  );
}
