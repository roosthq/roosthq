import { useCallback, useEffect, useState } from 'react';
import { api, type HolidayRule, type HolidayRuleInput, type HolidayRuleType } from './api';
import { useDialog } from './Dialog';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: -1, label: 'Last' },
];

const EMPTY: HolidayRuleInput = { title: '', ruleType: 'FIXED', month: 1, day: 1, weekday: null, ordinal: null, offsetDays: null };
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Both derived from the server-computed nextOccurrence (an ISO date, parsed
// as UTC — matches how it was built in holiday-rules.ts) rather than from
// the rule's own month/day fields, which don't exist for NTH_WEEKDAY and
// shift year to year for EASTER_OFFSET.
function monthTag(r: HolidayRule): string | null {
  if (!r.nextOccurrence) return null;
  return MONTH_SHORT[Number(r.nextOccurrence.slice(5, 7)) - 1];
}
function formatNext(r: HolidayRule): string {
  if (!r.nextOccurrence) return '';
  const [y, m, d] = r.nextOccurrence.split('-').map(Number);
  return `next: ${new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// Describes what a rule actually resolves to — the point of showing this is
// so picking "3rd Monday of January" reads back as plain English right next
// to the row, not just as three raw numbers.
function describe(r: HolidayRule): string {
  if (r.ruleType === 'FIXED') return r.month && r.day ? `${MONTHS[r.month - 1]} ${r.day}, every year` : 'Incomplete rule';
  if (r.ruleType === 'NTH_WEEKDAY') {
    if (!r.month || r.weekday == null || !r.ordinal) return 'Incomplete rule';
    const ordinalLabel = ORDINALS.find((o) => o.value === r.ordinal)?.label ?? r.ordinal;
    return `${ordinalLabel} ${WEEKDAYS[r.weekday]} of ${MONTHS[r.month - 1]}`;
  }
  const n = r.offsetDays ?? 0;
  if (n === 0) return 'Easter Sunday';
  return `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'before' : 'after'} Easter`;
}

// Owner-only: instance-wide "Holidays" calendar every family can add to
// their own picker (Calendar page filter, display config) — see
// HolidaysService for why this lives outside any one family. Rules, not
// stored dates, so "4th Thursday of November" stays correct every year.
export default function HolidaysPanel() {
  const { confirm } = useDialog();
  const [rules, setRules] = useState<HolidayRule[]>([]);
  const [form, setForm] = useState<HolidayRuleInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setRules(await api.listHolidays());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      await api.createHoliday(form);
      setForm(EMPTY);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Partial<HolidayRuleInput>) {
    setError(null);
    try {
      await api.updateHoliday(id, body);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function del(id: string, title: string) {
    if (await confirm(`Delete "${title}" from the global Holidays calendar? This removes it for every family.`, { danger: true, confirmLabel: 'Delete' })) {
      await api.deleteHoliday(id);
      await refresh();
    }
  }

  function setRuleType(ruleType: HolidayRuleType) {
    setForm((f) => ({
      ...f,
      ruleType,
      month: ruleType === 'EASTER_OFFSET' ? null : f.month ?? 1,
      day: ruleType === 'FIXED' ? f.day ?? 1 : null,
      weekday: ruleType === 'NTH_WEEKDAY' ? f.weekday ?? 0 : null,
      ordinal: ruleType === 'NTH_WEEKDAY' ? f.ordinal ?? 1 : null,
      offsetDays: ruleType === 'EASTER_OFFSET' ? f.offsetDays ?? 0 : null,
    }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Rules, not fixed dates — a "4th Thursday of November" holiday lands on the right day every year without upkeep. Any
        family can add "🎉 Holidays" to their own calendar list; nobody but you can edit what's in it.
      </p>

      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-slate-500">Name</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Arbor Day"
              className="mt-1 min-w-0 rounded border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500">Type</span>
            <select
              value={form.ruleType}
              onChange={(e) => setRuleType(e.target.value as HolidayRuleType)}
              className="mt-1 rounded border px-2 py-1.5 text-sm"
            >
              <option value="FIXED">Same date every year</option>
              <option value="NTH_WEEKDAY">Nth weekday of a month</option>
              <option value="EASTER_OFFSET">Relative to Easter</option>
            </select>
          </label>

          {form.ruleType === 'FIXED' && (
            <>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Month</span>
                <select
                  value={form.month ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
                  className="mt-1 rounded border px-2 py-1.5 text-sm"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Day</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.day ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, day: Number(e.target.value) }))}
                  onFocus={(e) => e.target.select()}
                  className="mt-1 w-16 rounded border px-2 py-1.5 text-sm"
                />
              </label>
            </>
          )}

          {form.ruleType === 'NTH_WEEKDAY' && (
            <>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Which</span>
                <select
                  value={form.ordinal ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, ordinal: Number(e.target.value) }))}
                  className="mt-1 rounded border px-2 py-1.5 text-sm"
                >
                  {ORDINALS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Weekday</span>
                <select
                  value={form.weekday ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))}
                  className="mt-1 rounded border px-2 py-1.5 text-sm"
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={w} value={i}>{w}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Of month</span>
                <select
                  value={form.month ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
                  className="mt-1 rounded border px-2 py-1.5 text-sm"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {form.ruleType === 'EASTER_OFFSET' && (
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Days from Easter</span>
              <input
                type="number"
                value={form.offsetDays ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, offsetDays: Number(e.target.value) }))}
                onFocus={(e) => e.target.select()}
                className="mt-1 w-20 rounded border px-2 py-1.5 text-sm"
              />
            </label>
          )}

          <button
            disabled={busy || !form.title.trim()}
            onClick={add}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
            {monthTag(r) && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {monthTag(r)}
              </span>
            )}
            <input
              defaultValue={r.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== r.title && patch(r.id, { title: e.target.value.trim() })}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            />
            <span className="shrink-0 text-slate-400">{describe(r)}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatNext(r)}</span>
            <button onClick={() => del(r.id, r.title)} className="ml-auto text-xs text-red-500 hover:text-red-700">
              Delete
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-slate-400">No holidays yet — add one above.</li>}
      </ul>
    </div>
  );
}
