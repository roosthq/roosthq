import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { CalEvent } from './api';
import Modal from './Modal';
import useNarrowViewport from './useNarrowViewport';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Every event chip carries its own arbitrary color (the calendar's, not the
// theme's) - a flat fill for backlog #6's "reads flat/plain". Same
// lighter-at-top-to-true-color sheen the theme's own cards get, built from
// whatever color this particular chip has rather than --accent, plus the
// same shadow token every other raised surface uses.
function chipStyle(color: string): CSSProperties {
  return {
    background: `linear-gradient(180deg, color-mix(in srgb, ${color} 78%, white 22%) 0%, ${color} 100%)`,
    boxShadow: 'var(--shadow-sm)',
  };
}

function isAllDay(e: CalEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime;
}

function dayStart(e: CalEvent): Date | null {
  if (e.start?.date) return new Date(`${e.start.date}T00:00:00`);
  if (e.start?.dateTime) {
    const d = new Date(e.start.dateTime);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// Last day (inclusive) the event should render on. Google all-day ends are exclusive;
// timed events ending exactly at midnight shouldn't paint the following day.
function dayEnd(e: CalEvent): Date | null {
  if (e.end?.date) {
    const d = new Date(`${e.end.date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (e.end?.dateTime) {
    const d = new Date(e.end.dateTime);
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// Every day key an event covers (so multi-day events span across the grid).
function coveredDays(e: CalEvent): string[] {
  const s = dayStart(e);
  if (!s) return [];
  let end = dayEnd(e);
  if (!end || end < s) end = s;
  const keys: string[] = [];
  const cur = new Date(s);
  for (let i = 0; cur <= end && i < 90; i++) {
    keys.push(keyOf(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

// Only meaningful for multi-day events - a single-day one's date is already
// obvious from which day's modal you're looking at, so showing it there
// too would just be clutter on every ordinary event.
function isMultiDay(e: CalEvent): boolean {
  const s = dayStart(e);
  const en = dayEnd(e);
  return !!s && !!en && keyOf(s) !== keyOf(en);
}

function dateRangeLabel(e: CalEvent): string {
  const s = dayStart(e);
  const en = dayEnd(e);
  if (!s || !en) return '';
  const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString(undefined, opt)} – ${en.toLocaleDateString(undefined, opt)}`;
}

function timeLabel(e: CalEvent): string {
  if (isAllDay(e)) return 'All day';
  const s = e.start?.dateTime;
  if (!s) return '';
  const opt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const startStr = new Date(s).toLocaleTimeString(undefined, opt);
  if (e.end?.dateTime) return `${startStr} – ${new Date(e.end.dateTime).toLocaleTimeString(undefined, opt)}`;
  return startStr;
}

function Avatar({ name, src, size = 'sm' }: { name?: string; src?: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-6 w-6 text-xs' : 'h-4 w-4 text-[9px]';
  if (src) return <img src={src} alt={name ?? ''} className={`${cls} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-300 font-medium text-slate-700`}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

// Month-grid calendar. Reports its visible range up so the parent fetches the right
// events; renders them per day (multi-day events span), and opens a day detail modal.
type ViewRange = 'month' | '2week' | '1week';
const RANGE_DAYS: Record<ViewRange, number> = { month: 42, '2week': 14, '1week': 7 };

export default function Calendar({
  events,
  onRangeChange,
  onAddEvent,
  onEditEvent,
  canEditEvent,
  size = 'normal',
  fill = false,
  touchControls = false,
  renderExtra,
  showPrint = false,
}: {
  events: CalEvent[];
  onRangeChange: (startISO: string, endISO: string) => void;
  // Renders an "+ Add event" button in the day-detail modal, prefilled with
  // whatever day was clicked - omit to leave the modal without one (the
  // kiosk's read-only "mini" calendar doesn't want it, for instance).
  onAddEvent?: (dateISO: string) => void;
  // Renders an "Edit" button on an event's row in the day-detail modal -
  // omit to leave events non-editable there. Paired with canEditEvent since
  // not every event this component renders is actually a real, writable
  // calendar event (a holiday occurrence or a chore's pseudo-event has
  // nothing to PATCH/DELETE).
  onEditEvent?: (e: CalEvent) => void;
  canEditEvent?: (e: CalEvent) => boolean;
  // 'mini' is the small "windows-style" side calendar for the kiosk's
  // person-focused layout - day numbers and per-calendar dots only, no event
  // text (there's no room for it), but still fully clickable/navigable.
  size?: 'normal' | 'large' | 'compact' | 'mini';
  // Stretch the day grid to fill the parent's height (rows share it equally)
  // instead of sizing each cell to a fixed min-height. Parent must give this
  // component a bounded height (e.g. flex-1 in a flex column) for it to work.
  fill?: boolean;
  // Bigger prev/today/next/view-range buttons - the kiosk sets this
  // regardless of `size`, since a finger needs a larger target than a mouse
  // cursor does no matter how the grid itself is sized.
  touchControls?: boolean;
  // Extra content under an event's description in the day-detail modal -
  // lets a caller bolt on domain-specific actions (e.g. chore claim/complete
  // buttons) without this component knowing anything about chores.
  renderExtra?: (e: CalEvent) => ReactNode;
  // "Print this week" button (main calendar page only - the kiosk has no
  // printer, and the mini side calendar has no room). Forces 1-week view
  // first (a printed month grid is too cramped to read on paper) then opens
  // the browser print dialog; index.css's @media print rules hide everything
  // outside the grid itself (nav, toolbars, these very controls).
  showPrint?: boolean;
}) {
  // Pivot date for whichever view is active - deliberately kept as today's
  // actual date, not normalized to the 1st of the month: the month grid calc
  // below only reads cursor's year/month (so this doesn't affect month view),
  // but 1week/2week read cursor's exact day to find "this" week. Normalizing
  // to day 1 here was why switching to 1wk/2wk always showed the start of the
  // month instead of the week actually containing today.
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  // Mini (kiosk side calendar) always stays a full month - no room for a
  // range picker, and the point of "mini" is the familiar month-grid glance.
  // Everyone else defaults to Month too, EXCEPT a narrow (phone-width) first
  // load: Month there is the dot-only grid below, but 1week gets the
  // full-width vertical day list (see `verticalWeek` below) - so a phone
  // should land on the view that's actually readable, not the one that
  // isn't.
  const [view, setView] = useState<ViewRange>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 && size !== 'mini' ? '1week' : 'month',
  );
  const effectiveView = size === 'mini' ? 'month' : view;

  const large = size === 'large';
  const compact = size === 'compact';
  const mini = size === 'mini';
  const cellMin = large ? 'min-h-[9rem]' : compact ? 'min-h-[4rem]' : mini ? 'min-h-[2.25rem]' : 'min-h-[6rem]';
  const maxChips = large ? 6 : compact ? 2 : 3;
  const ctrlCls = touchControls
    ? mini
      ? 'px-2.5 py-1.5 text-sm'
      : 'px-5 py-2.5 text-base'
    : mini
      ? 'px-1.5 py-0.5 text-xs'
      : 'px-3 py-1 text-sm';

  const rangeDays = RANGE_DAYS[effectiveView];
  const rows = rangeDays / 7;

  const gridStart = useMemo(() => {
    if (effectiveView === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const s = new Date(first);
      s.setDate(first.getDate() - first.getDay());
      s.setHours(0, 0, 0, 0);
      return s;
    }
    const s = new Date(cursor);
    s.setDate(cursor.getDate() - cursor.getDay());
    s.setHours(0, 0, 0, 0);
    return s;
  }, [cursor, effectiveView]);

  const days = useMemo(
    () =>
      Array.from({ length: rangeDays }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        return d;
      }),
    [gridStart, rangeDays],
  );

  useEffect(() => {
    const end = new Date(gridStart);
    end.setDate(gridStart.getDate() + rangeDays);
    onRangeChange(gridStart.toISOString(), end.toISOString());
  }, [gridStart, rangeDays, onRangeChange]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      for (const k of coveredDays(e)) {
        const arr = m.get(k);
        if (arr) arr.push(e);
        else m.set(k, [e]);
      }
    }
    // One deterministic order applied to EVERY cell: longest multi-day spans
    // first, then all-day, then timed. Cells used to sort independently by
    // time only, so a multi-day bar sat in row 0 in one cell and row 1 in the
    // next (whenever the neighbors differed) - visually snapping the
    // "continuous" bar apart. Longest-first keeps a bar in the same row for
    // its whole span in all but pathological overlaps.
    const spanDays = (e: CalEvent) => {
      const s = dayStart(e);
      const en = dayEnd(e);
      return s && en ? Math.round((en.getTime() - s.getTime()) / 86_400_000) + 1 : 1;
    };
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const sa = spanDays(a);
        const sb = spanDays(b);
        if (sa !== sb) return sb - sa;
        const aAll = isAllDay(a) ? 0 : 1;
        const bAll = isAllDay(b) ? 0 : 1;
        if (aAll !== bAll) return aAll - bAll;
        const st = (a.start?.dateTime ?? a.start?.date ?? '').localeCompare(b.start?.dateTime ?? b.start?.date ?? '');
        if (st !== 0) return st;
        return (a.uid ?? '').localeCompare(b.uid ?? '');
      });
    }
    return m;
  }, [events]);

  // Full lane allocation for multi-day bars, computed per week row: every
  // spanning event gets a stable lane (greedy first-fit, earliest-start
  // first), and every cell it covers renders that lane at the same list
  // index - with invisible same-height spacers filling any lane above it
  // that's unused on that particular day. That's what keeps a bar in one
  // straight line across the week even when neighboring days have different
  // event counts. Single-day items always render below the lanes.
  type LaneSeg = { e: CalEvent; isStart: boolean; isEnd: boolean; isWeekStart: boolean };
  const laneMap = useMemo(() => {
    const cellLanes = new Map<string, Array<LaneSeg | null>>();
    if (mini) return cellLanes;
    const spanning = events.filter((e) => {
      const s = dayStart(e);
      const en = dayEnd(e);
      return s && en && keyOf(s) !== keyOf(en);
    });
    if (!spanning.length) return cellLanes;
    for (let w = 0; w < days.length; w += 7) {
      const week = days.slice(w, w + 7);
      const wStart = week[0];
      const wEndExcl = new Date(week[week.length - 1]);
      wEndExcl.setHours(23, 59, 59, 999);
      const segs = spanning
        .map((e) => {
          const s = dayStart(e)!;
          const en = dayEnd(e)!;
          if (en < wStart || s > wEndExcl) return null;
          const startIdx = Math.max(0, Math.round((s.getTime() - wStart.getTime()) / 86_400_000));
          const endIdx = Math.min(week.length - 1, Math.round((en.getTime() - wStart.getTime()) / 86_400_000));
          return { e, startIdx, endIdx };
        })
        .filter((x): x is { e: CalEvent; startIdx: number; endIdx: number } => !!x)
        .sort(
          (a, b) =>
            a.startIdx - b.startIdx ||
            b.endIdx - a.endIdx ||
            (a.e.uid ?? '').localeCompare(b.e.uid ?? ''),
        );
      // Greedy first-fit: lane i is free for a segment iff the last segment
      // placed in lane i ended before this one starts.
      const laneEnds: number[] = [];
      for (const seg of segs) {
        let lane = laneEnds.findIndex((end) => end < seg.startIdx);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(seg.endIdx);
        } else {
          laneEnds[lane] = seg.endIdx;
        }
        for (let i = seg.startIdx; i <= seg.endIdx; i++) {
          const k = keyOf(week[i]);
          const arr = cellLanes.get(k) ?? [];
          while (arr.length <= lane) arr.push(null);
          arr[lane] = {
            e: seg.e,
            isStart: keyOf(dayStart(seg.e)!) === k,
            isEnd: keyOf(dayEnd(seg.e)!) === k,
            isWeekStart: i === seg.startIdx,
          };
          cellLanes.set(k, arr);
        }
      }
    }
    return cellLanes;
  }, [events, days, mini]);

  // Below `sm` (phones), the grid's `grid-cols-7` never actually goes away
  // just because 1wk/2wk shows fewer ROWS - every row is still 7 columns
  // wide, so each cell is the same ~45px sliver a month view gets, with room
  // for nothing but a dot. "Try a shorter range" genuinely can't fix that;
  // only a different LAYOUT can. So on a narrow screen, 1wk/2wk swap the
  // grid for a single-column list of full-width day cards with real event
  // text - month stays the familiar dot-grid overview (a month of full-width
  // cards would be an awful lot of scrolling, and tapping a day already
  // opens the same detail modal either way).
  const narrow = useNarrowViewport();
  const verticalWeek = narrow && !mini && effectiveView !== 'month';

  const todayKey = keyOf(new Date());
  const rangeLabel =
    effectiveView === 'month'
      ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : (() => {
          const last = new Date(gridStart);
          last.setDate(gridStart.getDate() + rangeDays - 1);
          const sameMonth = gridStart.getMonth() === last.getMonth();
          const startStr = gridStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const endStr = last.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
          return `${startStr} – ${endStr}`;
        })();
  const selectedEvents = selected ? byDay.get(selected) ?? [] : [];

  const shift = (delta: number) => {
    if (effectiveView === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    } else {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + delta * rangeDays);
      setCursor(d);
    }
  };
  const goToday = () => {
    // Same reasoning as the initial cursor above - month view only cares
    // about year/month so today's exact date works for every view.
    setCursor(new Date());
  };

  // Slide-in animation on every navigation (buttons, swipe, Today) - keyed
  // off animKey so the grid remounts and re-triggers the CSS animation each
  // time, direction-tagged so "next" and "prev" slide in from opposite
  // sides. Swipe: left/right always pages like the ‹/› buttons; up/down
  // does the same but only in 1wk/2wk (a month grid has no natural "up/down
  // is a week" reading, so it's left alone there - page scroll still works).
  const [animDir, setAnimDir] = useState<1 | -1>(1);
  const [animKey, setAnimKey] = useState(0);
  const navigate = (delta: 1 | -1) => {
    setAnimDir(delta);
    setAnimKey((k) => k + 1);
    shift(delta);
  };
  const jumpToday = () => {
    setAnimDir(cursor <= new Date() ? 1 : -1);
    setAnimKey((k) => k + 1);
    goToday();
  };

  // Simple threshold-based swipe recognizer (start/end point, no live drag
  // tracking) on the day grid itself. `swiped` on the ref (not state) so the
  // day-cell button's own onClick - which fires right after pointerup - can
  // check it synchronously and skip opening the day modal for what was
  // actually a page-turn, not a tap.
  const swipeRef = useRef<{ x: number; y: number; swiped: boolean } | null>(null);
  const SWIPE_THRESHOLD = 45;
  function onGridPointerDown(e: ReactPointerEvent) {
    swipeRef.current = { x: e.clientX, y: e.clientY, swiped: false };
  }
  function onGridPointerUp(e: ReactPointerEvent) {
    const s = swipeRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        s.swiped = true;
        navigate(dx < 0 ? 1 : -1);
      }
      // verticalWeek (mobile 1wk/2wk) never treats an up/down drag as a
      // page-turn - each "day" is a full-width card the user needs to
      // scroll PAST to see the rest of the week, so a vertical drag has to
      // stay a plain scroll. The grid layout still pages on either axis
      // (nothing there needs the vertical gesture for scrolling instead).
    } else if (!verticalWeek && (effectiveView === '1week' || effectiveView === '2week')) {
      if (Math.abs(dy) > SWIPE_THRESHOLD) {
        s.swiped = true;
        navigate(dy < 0 ? 1 : -1);
      }
    }
  }

  function handlePrint() {
    // A printed month grid is too cramped to read on paper - force the same
    // week-at-a-glance view the fridge printout is meant to be, then wait two
    // frames for that view switch to actually render before opening the
    // browser's print dialog (window.print() is synchronous/blocking, so it
    // has to happen strictly after the new grid is on screen, not before).
    setView('1week');
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  return (
    <section className={fill ? 'flex h-full flex-col' : 'mt-6'}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className={large ? 'text-3xl font-bold' : mini ? 'text-sm font-semibold' : 'text-xl font-semibold'}>{rangeLabel}</h2>
        <div className="no-print flex items-center gap-1">
          {showPrint && !mini && (
            <button onClick={handlePrint} title="Print this week for the fridge" className={`rounded border hover:bg-slate-50 ${ctrlCls}`}>
              🖨️
            </button>
          )}
          {!mini && (
            <div className="mr-1 flex rounded border text-sm">
              {(['1week', '2week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`first:rounded-l last:rounded-r ${ctrlCls} ${view === v ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                >
                  {v === '1week' ? '1wk' : v === '2week' ? '2wk' : 'Month'}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => navigate(-1)} className={`rounded border hover:bg-slate-50 ${ctrlCls}`}>‹</button>
          {/* Kept even in mini (the kiosk's person-focused side calendar) - a
              compressed calendar is exactly where jumping back to today
              matters most, since there's no room to see much else. */}
          <button onClick={jumpToday} className={`rounded border hover:bg-slate-50 ${ctrlCls}`}>
            Today
          </button>
          <button onClick={() => navigate(1)} className={`rounded border hover:bg-slate-50 ${ctrlCls}`}>›</button>
        </div>
      </div>

      {verticalWeek ? (
        <ul
          key={animKey}
          onPointerDown={onGridPointerDown}
          onPointerUp={onGridPointerUp}
          onPointerCancel={() => { swipeRef.current = null; }}
          className={`mt-3 space-y-2 ${animDir === 1 ? 'cal-slide-next' : 'cal-slide-prev'}`}
          // pan-y, not none: this list is taller than the viewport more
          // often than not, and a vertical drag here has to stay a normal
          // page scroll (only horizontal is claimed for prev/next-week
          // paging - see onGridPointerUp's verticalWeek check above).
          style={{ touchAction: 'pan-y' }}
        >
          {days.map((d) => {
            const k = keyOf(d);
            const isToday = k === todayKey;
            const dayEvents = byDay.get(k) ?? [];
            return (
              <li key={k}>
                <button
                  onClick={() => {
                    if (swipeRef.current?.swiped) return;
                    setSelected(k);
                  }}
                  className="card-nested flex w-full flex-col items-stretch gap-1.5 rounded-lg p-2.5 text-left"
                  style={{ boxShadow: isToday ? 'inset 0 0 0 2px var(--today)' : undefined }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${isToday ? 'today-badge inline-flex h-6 items-center rounded-full px-2' : 'text-slate-500'}`}
                      style={isToday ? { color: '#1c2e1c' } : undefined}
                    >
                      {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {dayEvents.length === 0 ? (
                    <span className="text-sm text-slate-400">Nothing planned</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {dayEvents.map((e) => (
                        <div key={`${e.uid}-${k}`} className="flex items-center gap-2 overflow-hidden">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.calendarColor ?? '#94a3b8' }} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title ?? '(no title)'}</span>
                          {!isAllDay(e) && <span className="shrink-0 text-xs text-slate-400">{timeLabel(e)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
      <div
        key={animKey}
        onPointerDown={onGridPointerDown}
        onPointerUp={onGridPointerUp}
        onPointerCancel={() => { swipeRef.current = null; }}
        className={`mt-3 grid grid-cols-7 gap-px overflow-hidden rounded border bg-slate-200 ${fill ? 'flex-1' : ''} ${animDir === 1 ? 'cal-slide-next' : 'cal-slide-prev'}`}
        style={{
          ...(fill ? { gridTemplateRows: `auto repeat(${rows}, minmax(0, 1fr))` } : undefined),
          // touch-action must EXCLUDE any pan direction we want to recognize
          // as a swipe: once the browser claims a permitted pan it fires
          // pointercancel and our pointerup never runs (mouse drags are
          // unaffected, which is why this only broke on the kiosk's real
          // touchscreen). Month view only swipes horizontally, so keep
          // vertical page scroll (`pan-y`); 1wk/2wk swipe both axes, so the
          // browser gets neither (`none`).
          touchAction: effectiveView === 'month' ? 'pan-y' : 'none',
        }}
      >
        {WEEKDAYS.map((w) => (
          <div key={w} className={`bg-slate-50 text-center font-medium text-slate-500 ${large ? 'py-1 text-sm' : mini ? 'py-0.5 text-[10px]' : 'py-1 text-xs'}`}>
            {mini ? w.slice(0, 1) : w}
          </div>
        ))}
        {days.map((d) => {
          const k = keyOf(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === todayKey;
          const isSelected = k === selected;
          const dayEvents = byDay.get(k) ?? [];
          // Pills default large so they stand out; only shrink once a day's
          // too crowded for that to fit - sized off this day's own count, not
          // the component's overall size prop (a busy day in "large" mode
          // still needs to shrink its pills same as a busy day anywhere else).
          const pillCls =
            dayEvents.length <= 2
              ? 'gap-1.5 px-2 py-1 text-sm'
              : dayEvents.length <= 4
                ? 'gap-1 px-1.5 py-0.5 text-xs'
                : 'gap-0.5 px-1 py-0.5 text-[10px]';
          return (
            <button
              key={k}
              onClick={() => {
                // A swipe that ends over a day cell shouldn't also open it -
                // onGridPointerUp (bubbled up from this same pointerup) already
                // set this synchronously, before the click fires.
                if (swipeRef.current?.swiped) return;
                setSelected(k);
              }}
              className={`cal-day-cell ${fill ? 'h-full min-h-0 overflow-hidden' : cellMin} flex flex-col items-stretch justify-start p-1 text-left ${inMonth ? 'bg-white' : 'text-slate-400'}`}
              style={{
                background: isToday
                  ? 'rgba(212,192,106,0.16)'
                  : inMonth
                    ? undefined
                    : 'var(--surface-off)',
                boxShadow: isSelected
                  ? 'inset 0 0 0 2px var(--accent)'
                  : isToday
                    ? 'inset 0 0 0 2px var(--today)'
                    : undefined,
              }}
            >
              <div
                className={`${mini ? 'mb-0.5 text-[11px]' : 'mb-1'} ${large ? 'text-base' : 'text-xs'} font-medium ${
                  isToday ? `today-badge inline-flex items-center justify-center rounded-full ${mini ? 'h-4 w-4' : 'h-6 w-6'}` : ''
                }`}
                style={isToday ? { color: '#1c2e1c' } : undefined}
              >
                {d.getDate()}
              </div>
              {mini ? (
                <div className="flex flex-wrap gap-0.5">
                  {Array.from(new Set(dayEvents.map((e) => e.calendarColor ?? '#94a3b8')))
                    .slice(0, 6)
                    .map((color) => <span key={color} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />)}
                </div>
              ) : (
                <>
                  {/* Solid-color pills (the calendar's own color) on wider
                      screens; below sm there's only room for a per-calendar
                      dot + count - tap the day for the rest. Multi-day events
                      render first via laneMap: same lane index in every cell
                      they cover (spacers hold empty lanes), fixed height, so
                      each bar reads as one straight continuous line across
                      the week. Single-day items stack under the lanes. */}
                  <div className="hidden space-y-0.5 sm:block">
                    {(laneMap.get(k) ?? []).map((seg, laneIdx) =>
                      seg ? (
                        <div
                          key={`${seg.e.uid}-${k}`}
                          className={`flex h-5 items-center gap-1 overflow-hidden px-1.5 text-xs font-medium text-white ${
                            seg.isStart ? 'rounded-l-full' : '-ml-1'
                          } ${seg.isEnd ? 'rounded-r-full' : '-mr-1'}`}
                          style={chipStyle(seg.e.calendarColor ?? '#94a3b8')}
                        >
                          {/* Title/avatar repaint at each week's first covered
                              day, so a bar wrapping rows never goes nameless. */}
                          {seg.isWeekStart && <Avatar name={seg.e.ownerName} src={seg.e.ownerAvatar} />}
                          <span className="truncate">{seg.isWeekStart ? seg.e.title ?? '(no title)' : ' '}</span>
                        </div>
                      ) : (
                        <div key={`lane-spacer-${laneIdx}-${k}`} className="h-5" />
                      ),
                    )}
                    {(() => {
                      const laneCount = (laneMap.get(k) ?? []).length;
                      const singles = dayEvents.filter((e) => {
                        const s = dayStart(e);
                        const en = dayEnd(e);
                        return !(s && en && keyOf(s) !== keyOf(en));
                      });
                      const room = Math.max(0, maxChips - laneCount);
                      return (
                        <>
                          {singles.slice(0, room).map((e) => (
                            <div
                              key={`${e.uid}-${k}`}
                              className={`flex items-center overflow-hidden rounded-full font-medium text-white ${pillCls}`}
                              style={chipStyle(e.calendarColor ?? '#94a3b8')}
                            >
                              <Avatar name={e.ownerName} src={e.ownerAvatar} />
                              <span className="truncate">{e.title ?? '(no title)'}</span>
                            </div>
                          ))}
                          {singles.length > room && (
                            <div className="text-xs text-slate-400">+{singles.length - room} more</div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-1 sm:hidden">
                    {Array.from(
                      dayEvents.reduce((m, e) => {
                        const cur = m.get(e.calendarId);
                        if (cur) cur.count++;
                        else m.set(e.calendarId, { color: e.calendarColor ?? '#94a3b8', count: 1 });
                        return m;
                      }, new Map<string, { color: string; count: number }>()),
                    ).map(([calendarId, { color, count }]) => (
                      <span key={calendarId} className="inline-flex items-center gap-0.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="text-[10px] leading-none text-slate-500">{count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
      )}

      {selected && (
        <Modal
          maxWidthClass="max-w-lg"
          onBackdropClick={() => setSelected(null)}
          header={
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">
                {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
              <div className="flex items-center gap-3">
                {onAddEvent && (
                  // Deliberately doesn't close this modal - the day stays
                  // highlighted and its detail view stays open underneath,
                  // so the new event shows up in it the moment it's saved.
                  <button onClick={() => onAddEvent(selected)} className="rounded bg-slate-800 px-2 py-1 text-sm text-white hover:bg-slate-700">
                    + Add event
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
            </div>
          }
        >
          <ul className="space-y-2">
            {selectedEvents.map((e) => (
              <li
                key={`${e.uid}-detail`}
                className="card-nested flex gap-3 rounded border-l-4 p-3"
                style={{ borderLeftColor: e.calendarColor ?? '#94a3b8' }}
              >
                <Avatar name={e.ownerName} src={e.ownerAvatar} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{e.title ?? '(no title)'}</div>
                    {onEditEvent && canEditEvent?.(e) && (
                      <button onClick={() => onEditEvent(e)} className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-slate-50">
                        Edit
                      </button>
                    )}
                  </div>
                  {/* Which calendar this actually belongs to - two events with
                      the same title on different calendars (e.g. two kids'
                      separate "Spring Break") were otherwise indistinguishable
                      here, even though the month grid's own pills already
                      color-code by calendar. */}
                  {e.calendarName && (
                    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: e.calendarColor ?? '#64748b' }}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.calendarColor ?? '#94a3b8' }} />
                      {e.calendarName}
                    </div>
                  )}
                  <div className="text-sm text-slate-500">
                    {timeLabel(e)}
                    {isMultiDay(e) ? ` · ${dateRangeLabel(e)}` : ''}
                    {e.location ? ` · ${e.location}` : ''}
                  </div>
                  {e.description && <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap break-words">{e.description}</div>}
                  {e.ownerName && <div className="text-xs text-slate-400">{e.ownerName}</div>}
                  {e.addedByName && <div className="text-xs text-slate-400">Added by {e.addedByName}</div>}
                  {renderExtra?.(e)}
                </div>
              </li>
            ))}
            {selectedEvents.length === 0 && <li className="text-sm text-slate-400">No events this day.</li>}
          </ul>
        </Modal>
      )}
    </section>
  );
}
