import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, FEATURE_TREE, type FamilySettings, type FeatureNode, type CustomSound } from '../api';
import Switch from '../Switch';
import IconPicker from '../IconPicker';
import { useDialog } from '../Dialog';
import { BUILTIN_SOUNDS, SOUND_SLOTS, playBuiltinSound, playCustomSound } from '../sounds';
import TokenScalePanel from '../TokenScalePanel';
import { GAME_TYPES, GAME_TYPE_META } from '../rewardGames';

const input = 'w-full rounded border px-3 py-1.5 text-sm';

// Family Settings > Features. Each top-level module in FEATURE_TREE is its
// own card: a switch, a description, and - only while it's on - a slide-
// down region holding its sub-feature switches plus (for Tokens/Chores)
// the small bit of always-relevant customization that used to live in its
// own separate "Family" tab (reward name/icon/value, chore language). They
// belong here now: both are meaningless once their parent feature is off.
export default function FeaturesTab() {
  const [family, setFamily] = useState<FamilySettings | null>(null);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(() => {
    api.familySettings().then(setFamily).catch(() => undefined);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!family) return null;

  async function setFeature(id: string, on: boolean) {
    const next = new Set(family!.disabledFeatures);
    if (on) next.delete(id);
    else next.add(id);
    const disabledFeatures = [...next];
    setFamily({ ...family!, disabledFeatures });
    await api.updateFamilySettings({ disabledFeatures });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  const disabled = new Set(family.disabledFeatures);

  return (
    <div className="space-y-4">
      {FEATURE_TREE.map((node) => (
        <FeatureCard key={node.id} node={node} disabled={disabled} onToggle={setFeature} family={family} onFamilyChanged={setFamily} />
      ))}
      {saved && <p className="text-sm text-green-600">Saved</p>}
      <SoundsPanel family={family} onFamilyChanged={setFamily} />
    </div>
  );
}

function FeatureCard({
  node,
  disabled,
  onToggle,
  family,
  onFamilyChanged,
}: {
  node: FeatureNode;
  disabled: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  family: FamilySettings;
  onFamilyChanged: (f: FamilySettings) => void;
}) {
  const blockedBy = node.requires && disabled.has(node.requires) ? FEATURE_TREE.find((n) => n.id === node.requires)?.label : null;
  const isOn = !disabled.has(node.id) && !blockedBy;
  const hasSlideContent = !!node.children?.length || node.id === 'tokens' || node.id === 'chores';

  return (
    <div className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">{node.label}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{node.help}</p>
          {blockedBy && <p className="mt-1 text-xs font-medium text-amber-600">Needs {blockedBy} on first.</p>}
        </div>
        <Switch checked={isOn} disabled={!!blockedBy} onChange={(v) => onToggle(node.id, v)} label={node.label} />
      </div>

      {hasSlideContent && (
        <div className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: isOn ? '1fr' : '0fr' }}>
          <div className="overflow-hidden">
            <div className="mt-3 space-y-3 border-t pt-3">
              {node.id === 'tokens' && <TokenFields family={family} onSaved={onFamilyChanged} />}
              {node.id === 'chores' && <ChoreWordField family={family} onSaved={onFamilyChanged} />}
              {node.children?.map((child) => (
                <SubFeatureRow key={child.id} node={child} disabled={disabled} onToggle={onToggle} family={family} onFamilyChanged={onFamilyChanged} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubFeatureRow({
  node,
  disabled,
  onToggle,
  family,
  onFamilyChanged,
}: {
  node: FeatureNode;
  disabled: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  family: FamilySettings;
  onFamilyChanged: (f: FamilySettings) => void;
}) {
  const blockedBy = node.requires && disabled.has(node.requires) ? FEATURE_TREE.find((n) => n.id === node.requires)?.label : null;
  const isOn = !disabled.has(node.id) && !blockedBy;
  return (
    <div className="pl-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{node.label}</p>
          <p className="text-xs text-slate-400">{node.help}</p>
          {blockedBy && <p className="text-xs font-medium text-amber-600">Needs {blockedBy} on first.</p>}
        </div>
        <Switch size="sm" checked={isOn} disabled={!!blockedBy} onChange={(v) => onToggle(node.id, v)} label={node.label} />
      </div>
      {node.id === 'surpriseReward' && isOn && <SurpriseRewardField family={family} onSaved={onFamilyChanged} />}
      {node.id === 'bonusWheel' && isOn && <BonusWheelRangeField family={family} onSaved={onFamilyChanged} />}
    </div>
  );
}

// Moved here from the old standalone "Family" tab - meaningless with Tokens
// off, so it lives inside the Tokens card's slide-open region instead.
function TokenFields({ family, onSaved }: { family: FamilySettings; onSaved: (f: FamilySettings) => void }) {
  const [name, setName] = useState(family.tokenName);
  const [icon, setIcon] = useState(family.tokenIcon);
  const [saved, setSaved] = useState(false);

  async function save() {
    const updated = await api.updateFamilySettings({ tokenName: name, tokenIcon: icon });
    onSaved(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm">
          <span className="text-slate-500">What do you call your reward currency?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1 max-w-xs`} />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">Icon</span>
          <div className="mt-1">
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Save
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
      {/* $-per-token isn't a plain field here anymore - changing it rescales
          every token-denominated number in the family (PLANNING.md §17), so
          it gets its own guarded flow instead of a value that could be
          edited by accident alongside the name/icon above. */}
      <div className="border-t pt-3">
        <TokenScalePanel family={family} onChanged={() => api.familySettings().then(onSaved)} />
      </div>
    </div>
  );
}

// #8 - the one adjustable knob for surprise rewards: roughly how often, in
// days, an eligible kid should get one on average. The cron itself
// (household.service.ts) rolls 1-in-N odds per kid per day rather than a
// fixed date, so this is an average, not a countdown.
function SurpriseRewardField({ family, onSaved }: { family: FamilySettings; onSaved: (f: FamilySettings) => void }) {
  const [days, setDays] = useState(family.surpriseRewardDays);
  const [saved, setSaved] = useState(false);

  async function save() {
    const updated = await api.updateFamilySettings({ surpriseRewardDays: Math.max(1, Math.floor(Number(days) || 30)) });
    onSaved(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 pl-1">
      <label className="block text-sm">
        <span className="text-slate-500">About once every</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            className={`${input} w-20`}
          />
          <span className="text-slate-500">days, per kid</span>
        </span>
      </label>
      <button onClick={save} className="rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700">
        Save
      </button>
      {saved && <span className="text-sm text-green-600">Saved</span>}
    </div>
  );
}

// The chore-streak milestone wheel's reward range - was a hardcoded 1-5
// literal until PLANNING.md §17 made it a real field so a token rescale has
// something to multiply. Editable directly here too (unlike tokenValueUsd,
// this doesn't cascade into anything else - it's just this one range), same
// min/max shape an Award's own wheelMin/wheelMax already uses on AwardsPage.
function BonusWheelRangeField({ family, onSaved }: { family: FamilySettings; onSaved: (f: FamilySettings) => void }) {
  const [min, setMin] = useState(family.streakWheelMin);
  const [max, setMax] = useState(family.streakWheelMax);
  const [gameType, setGameType] = useState(family.streakWheelGameType ?? '');
  const [saved, setSaved] = useState(false);

  async function save() {
    const updated = await api.updateFamilySettings({
      streakWheelMin: Math.max(0, Math.floor(min)),
      streakWheelMax: Math.max(0, Math.floor(max)),
      streakWheelGameType: gameType || null,
    });
    setMin(updated.streakWheelMin);
    setMax(updated.streakWheelMax);
    setGameType(updated.streakWheelGameType ?? '');
    onSaved(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 pl-1">
      <label className="block text-sm">
        <span className="text-slate-500">Worth</span>
        <span className="mt-1 flex items-center gap-2">
          <input type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} onFocus={(e) => e.target.select()} className={`${input} w-16`} />
          <span className="text-slate-500">to</span>
          <input type="number" min={0} value={max} onChange={(e) => setMax(Number(e.target.value))} onFocus={(e) => e.target.select()} className={`${input} w-16`} />
          <span className="text-slate-500">extra tokens</span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-slate-500">Game</span>
        <select value={gameType} onChange={(e) => setGameType(e.target.value)} className={`${input} mt-1 w-44`}>
          <option value="">🎲 Surprise me (random)</option>
          {GAME_TYPES.map((gt) => (
            <option key={gt} value={gt}>
              {GAME_TYPE_META[gt].label}
            </option>
          ))}
        </select>
      </label>
      <button onClick={save} className="rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700">
        Save
      </button>
      {saved && <span className="text-sm text-green-600">Saved</span>}
    </div>
  );
}

// Moved here from the old standalone "Family" tab - same reasoning, lives in
// the Chores card now.
function ChoreWordField({ family, onSaved }: { family: FamilySettings; onSaved: (f: FamilySettings) => void }) {
  const [word, setWord] = useState(family.choreWord);
  const [saved, setSaved] = useState(false);

  async function save() {
    const updated = await api.updateFamilySettings({ choreWord: word });
    onSaved(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-slate-500">What do you call chores?</span>
        <span className="ml-2 text-xs text-slate-400">try "Quest" or "Task" to put the focus on earning</span>
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Chore" className={`${input} mt-1 max-w-xs`} />
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Save
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}

// #1: family-wide sound library. A standalone card, not tied to any one
// FEATURE_TREE node - every slot here fires regardless of which modules are
// on (a chore-completed chime still matters with tokens off, say).
function SoundsPanel({ family, onFamilyChanged }: { family: FamilySettings; onFamilyChanged: (f: FamilySettings) => void }) {
  const { alert } = useDialog();
  const [custom, setCustom] = useState<CustomSound[]>([]);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.customSounds().then(setCustom).catch(() => undefined);
  }, []);

  function valueFor(slotId: string): string {
    const a = family.soundAssignments[slotId];
    return a ? `${a.type}:${a.id}` : 'builtin:chime';
  }

  async function setSlot(slotId: string, value: string) {
    const [type, id] = value.split(':') as ['builtin' | 'custom', string];
    const next = { ...family.soundAssignments, [slotId]: { type, id } };
    const updated = await api.updateFamilySettings({ soundAssignments: next });
    onFamilyChanged(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  function preview(value: string) {
    const [type, id] = value.split(':');
    if (type === 'custom') {
      const c = custom.find((s) => s.id === id);
      if (c) playCustomSound(c.dataUri);
    } else {
      playBuiltinSound(id);
    }
  }

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!uploadLabel.trim()) {
      await alert('Give this sound a name first.');
      return;
    }
    if (file.size > 260_000) {
      await alert('That file is too big - keep custom sounds under ~250KB.');
      return;
    }
    setUploading(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      // A data: URI has no separate "duration" field to check server-side -
      // read it back through a throwaway <audio> element for the 4s cap.
      const duration = await new Promise<number>((resolve) => {
        const a = new Audio(dataUri);
        a.onloadedmetadata = () => resolve(a.duration || 0);
        a.onerror = () => resolve(0);
      });
      if (duration > 4.5) {
        await alert('Keep custom sounds to 4 seconds or under.');
        return;
      }
      const created = await api.createCustomSound({ label: uploadLabel.trim(), dataUri });
      setCustom((c) => [...c, created]);
      setUploadLabel('');
    } catch {
      await alert('Could not read that file.');
    } finally {
      setUploading(false);
    }
  }

  async function removeCustom(id: string) {
    await api.deleteCustomSound(id);
    setCustom((c) => c.filter((s) => s.id !== id));
    // Any slot pointing at this upload was cleared server-side too - refetch
    // so the dropdowns below reflect that instead of showing a stale value.
    onFamilyChanged(await api.familySettings());
  }

  return (
    <div className="panel">
      <h3 className="text-base font-semibold tracking-tight">🔊 Sounds</h3>
      <p className="mt-0.5 text-sm text-slate-500">Which sound plays for which moment - family-wide, same set for everyone.</p>

      <div className="mt-3 space-y-2">
        {SOUND_SLOTS.map((slot) => {
          const value = valueFor(slot.id);
          return (
            <div key={slot.id} className="card-nested flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm">
              <div className="min-w-[11rem] flex-1">
                <p className="font-medium">{slot.label}</p>
                <p className="text-xs text-slate-400">{slot.help}</p>
              </div>
              <select value={value} onChange={(e) => setSlot(slot.id, e.target.value)} className={`${input} w-auto`}>
                <optgroup label="Built-in">
                  {BUILTIN_SOUNDS.map((s) => (
                    <option key={s.id} value={`builtin:${s.id}`}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
                {custom.length > 0 && (
                  <optgroup label="Custom">
                    {custom.map((c) => (
                      <option key={c.id} value={`custom:${c.id}`}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button type="button" onClick={() => preview(value)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50" title="Play this sound">
                ▶ Preview
              </button>
            </div>
          );
        })}
      </div>
      {saved && <p className="mt-2 text-sm text-green-600">Saved</p>}

      <div className="mt-4 border-t pt-3">
        <p className="text-sm font-medium">Custom sounds</p>
        <p className="text-xs text-slate-400">Up to ~250KB, 4 seconds - anything longer gets rejected with why.</p>
        <ul className="mt-2 space-y-1">
          {custom.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{c.label}</span>
              <button type="button" onClick={() => playCustomSound(c.dataUri)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                ▶
              </button>
              <button type="button" onClick={() => removeCustom(c.id)} className="btn-delete rounded px-2 py-0.5 text-xs">
                Delete
              </button>
            </li>
          ))}
          {custom.length === 0 && <li className="text-xs text-slate-400">No custom sounds uploaded yet.</li>}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={uploadLabel}
            onChange={(e) => setUploadLabel(e.target.value)}
            placeholder="Name this sound"
            className={`${input} max-w-xs`}
          />
          <label className="cursor-pointer rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
            {uploading ? 'Uploading…' : '+ Upload a sound'}
            <input type="file" accept="audio/*" onChange={onUploadFile} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>
    </div>
  );
}
