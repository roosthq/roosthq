import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type FamilySetupStatus } from './api';

// New-family checklist: a brand-new instance otherwise opens to an empty
// calendar with no hint of what to do next. Shown to the owner / family
// managers on the home page until the basics exist (or they dismiss it).
const DISMISS_KEY = 'rhq_setup_checklist_dismissed';

interface Step {
  id: string;
  label: string;
  detail: string;
  to: string;
  done: boolean;
  optional?: boolean;
}

function dismissedAlready(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function FirstRunChecklist({ choreWord }: { choreWord: string }) {
  const [status, setStatus] = useState<FamilySetupStatus | null>(null);
  const [hidden, setHidden] = useState(dismissedAlready());

  useEffect(() => {
    if (hidden) return;
    api.familySetupStatus().then(setStatus).catch(() => undefined);
  }, [hidden]);

  if (hidden || !status) return null;

  const word = choreWord.toLowerCase();
  const steps: Step[] = [
    { id: 'kids', label: 'Add your kids', detail: 'Give each child a profile (no email needed).', to: '/settings', done: status.kids > 0 },
    { id: 'chores', label: `Create a ${word}`, detail: `Pick from the starter packs or make your own.`, to: '/chores', done: status.chores > 0 },
    { id: 'calendar', label: 'Connect a calendar', detail: 'Add a local calendar, or link Google Calendar.', to: '/settings?tab=calendars', done: status.calendars > 0 },
    { id: 'prizes', label: 'Add a prize to the store', detail: 'Something worth earning tokens for.', to: '/store', done: status.prizes > 0, optional: true },
    { id: 'kiosk', label: 'Set up a wall display', detail: 'Optional: a Raspberry Pi or tablet showing the family day.', to: '/settings?tab=displays', done: status.displays > 0, optional: true },
  ];
  const required = steps.filter((s) => !s.optional);
  if (required.every((s) => s.done)) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage blocked: stays visible */
    }
    setHidden(true);
  }

  return (
    <section className="panel no-print mb-4" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Getting started</h3>
          <p className="mt-1 text-sm text-slate-500">A few things make Roost HQ useful for your family. Do them in any order.</p>
        </div>
        <button onClick={dismiss} className="shrink-0 text-xs text-slate-400 underline hover:text-slate-600">
          Hide
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${s.done ? 'bg-slate-800 text-white' : 'text-transparent'}`}
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <Link to={s.to} className={`font-medium hover:underline ${s.done ? 'text-slate-400 line-through' : ''}`}>
                {s.label}
                {s.optional && <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>}
              </Link>
              {!s.done && <p className="text-xs text-slate-500">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
