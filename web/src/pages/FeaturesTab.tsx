import { useCallback, useEffect, useState } from 'react';
import { api, FEATURE_TREE, type FamilySettings, type FeatureNode } from '../api';
import Switch from '../Switch';
import IconPicker from '../IconPicker';

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
                <SubFeatureRow key={child.id} node={child} disabled={disabled} onToggle={onToggle} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubFeatureRow({ node, disabled, onToggle }: { node: FeatureNode; disabled: Set<string>; onToggle: (id: string, on: boolean) => void }) {
  const blockedBy = node.requires && disabled.has(node.requires) ? FEATURE_TREE.find((n) => n.id === node.requires)?.label : null;
  return (
    <div className="flex items-start justify-between gap-3 pl-1">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{node.label}</p>
        <p className="text-xs text-slate-400">{node.help}</p>
        {blockedBy && <p className="text-xs font-medium text-amber-600">Needs {blockedBy} on first.</p>}
      </div>
      <Switch size="sm" checked={!disabled.has(node.id) && !blockedBy} disabled={!!blockedBy} onChange={(v) => onToggle(node.id, v)} label={node.label} />
    </div>
  );
}

// Moved here from the old standalone "Family" tab - meaningless with Tokens
// off, so it lives inside the Tokens card's slide-open region instead.
function TokenFields({ family, onSaved }: { family: FamilySettings; onSaved: (f: FamilySettings) => void }) {
  const [name, setName] = useState(family.tokenName);
  const [icon, setIcon] = useState(family.tokenIcon);
  const [valueUsd, setValueUsd] = useState(family.tokenValueUsd);
  const [saved, setSaved] = useState(false);

  async function save() {
    const updated = await api.updateFamilySettings({ tokenName: name, tokenIcon: icon, tokenValueUsd: valueUsd });
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
        <label className="block text-sm">
          <span className="text-slate-500">1 unit = how many dollars?</span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={valueUsd}
            onChange={(e) => setValueUsd(Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            className={`${input} mt-1 w-24`}
          />
          <span className="ml-2 text-xs text-slate-400">
            e.g. 1 {icon} {name || 'Tokens'} = ${valueUsd || 0}
          </span>
        </label>
      </div>
      <p className="text-xs text-slate-400">The $ value is used to suggest a token cost for prizes based on their real price (rounded down).</p>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Save
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
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
