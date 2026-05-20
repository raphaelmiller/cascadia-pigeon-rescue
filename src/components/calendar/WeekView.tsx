'use client';

// =====================================================================
// WeekView — Google-Calendar-ish 7-column time grid with drag-to-create.
//
// Shared by the four PR-B pages:
//   /transport/availability  /transport/shifts
//   /rescue/availability      /rescue/shifts
//
// Built deliberately *without* a heavy calendar library. ~350 lines of
// focused TSX gives us full control over the touch + mouse drag UX and
// the rendering of recurring instances (subtle repeat indicator) and
// conflicts (red border).
//
// Layout:
//   • Header row: prev / today / next + the week label, plus a "+ block"
//     hint for the parent. (Parent supplies the page title outside.)
//   • Time grid: 7 columns × 17 hours (6 AM – 10 PM by default), each
//     hour divided into 4 quarter-hour cells for 15-min snap.
//   • Today's column gets a soft teal background tint.
//   • Each event is absolutely-positioned inside its day column at a
//     top:px / height:px derived from minutes-from-grid-start.
//   • Click an event → onEdit(occurrence). Click + drag empty area →
//     onCreate(start, end). Touch supported via touchstart/move/end.
//
// Mobile: the grid container is horizontally scrollable on phones (the
// 7 day columns get min-width so they don't squish). Pinch-zoom is
// browser-default.
// =====================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays, addWeeks, eachDayOfInterval, endOfDay, endOfWeek, format,
  isSameDay, isToday, startOfDay, startOfWeek, subWeeks,
} from 'date-fns';

// ---------- types ----------

export type WeekEvent = {
  /** Stable id for this rendered occurrence (one-off id, or `${sourceId}__${iso}`). */
  occurrenceId: string;
  sourceId: string;
  startsAt: Date;
  endsAt: Date;
  /** Visual class — caller picks the color triage. */
  variant: 'availability' | 'shift';
  /** Optional flags surfaced via the visual treatment. */
  isRecurringInstance?: boolean;
  hasConflict?: boolean;
  /** Top-line label (e.g. assignee name or block title). */
  title: string;
  /** Optional secondary line (e.g. role / shift status / time). */
  subtitle?: string;
};

export type WeekViewProps = {
  /** Date inside the week to show. */
  cursor: Date;
  /** Events rendered on the grid. */
  events: WeekEvent[];
  /** Hour the grid starts at, 0..23. Default 6 (= 6 AM). */
  startHour?: number;
  /** Hour the grid ends at, exclusive, 1..24. Default 22 (= 10 PM). */
  endHour?: number;
  /** Called when user clicks an existing event. */
  onEdit?: (occurrenceId: string) => void;
  /**
   * Called when user finishes a drag-to-create on empty grid. Dates are
   * already snapped to 15-min boundaries. Caller should open the create
   * modal pre-filled with this range.
   */
  onCreate?: (startsAt: Date, endsAt: Date) => void;
  /**
   * Base path for the prev/today/next links. Output is
   * `${weekHrefBase}?date=YYYY-MM-DD${weekHrefSuffix ?? ''}`.
   * Defaults to the current pathname (relative ?date=…).
   */
  weekHrefBase?: string;
  /** Optional extra query string fragment appended after `&` (no leading &). */
  weekHrefSuffix?: string;
};

// ---------- component ----------

export function WeekView({
  cursor,
  events,
  startHour = 6,
  endHour = 22,
  onEdit,
  onCreate,
  weekHrefBase,
  weekHrefSuffix,
}: WeekViewProps) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 }); // Mon
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const hoursInGrid = endHour - startHour;
  const PX_PER_HOUR = 56; // grid hour height — readable on mobile
  const SLOT_MIN = 15;
  const SLOTS_PER_HOUR = 60 / SLOT_MIN;
  const totalSlots = hoursInGrid * SLOTS_PER_HOUR;

  const minutesFromGridStart = (d: Date, dayBase: Date) => {
    const localMidnight = startOfDay(dayBase);
    const startMinutes = startHour * 60;
    const total = (d.getTime() - localMidnight.getTime()) / 60000;
    return total - startMinutes;
  };

  // Clamp + project an event onto its day column. Returns null if it
  // falls entirely outside [startHour, endHour] on the day in question.
  const project = (ev: WeekEvent, day: Date) => {
    if (!isSameDay(ev.startsAt, day)) return null;
    const startMin = minutesFromGridStart(ev.startsAt, day);
    const endMin = minutesFromGridStart(ev.endsAt, day);
    const clampedStart = Math.max(0, startMin);
    const clampedEnd = Math.min(hoursInGrid * 60, endMin);
    if (clampedEnd <= 0 || clampedStart >= hoursInGrid * 60) return null;
    const top = (clampedStart / 60) * PX_PER_HOUR;
    const height = Math.max(18, ((clampedEnd - clampedStart) / 60) * PX_PER_HOUR);
    return { top, height };
  };

  // ---------- drag-to-create state ----------
  const gridRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [dragState, setDragState] = useState<null | {
    dayIso: string;
    startSlot: number;
    endSlot: number;
  }>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Convert a pointer Y inside a day column into a slot index 0..totalSlots.
  const pointToSlot = (clientY: number, dayKey: string) => {
    const el = gridRefs.current.get(dayKey);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top;
    const slotPx = PX_PER_HOUR / SLOTS_PER_HOUR;
    const slot = Math.max(0, Math.min(totalSlots, Math.floor(y / slotPx)));
    return slot;
  };

  const slotToDate = (day: Date, slot: number) => {
    const base = startOfDay(day);
    const minutes = startHour * 60 + slot * SLOT_MIN;
    return new Date(base.getTime() + minutes * 60000);
  };

  const onPointerDown = (e: React.PointerEvent, day: Date) => {
    if (!onCreate) return;
    // Only react to primary mouse button / touch / pen.
    if (e.button !== undefined && e.button !== 0) return;
    const dayKey = day.toISOString();
    const slot = pointToSlot(e.clientY, dayKey);
    if (slot == null) return;
    setDragState({ dayIso: dayKey, startSlot: slot, endSlot: slot + 1 });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent, day: Date) => {
    const st = dragStateRef.current;
    if (!st) return;
    const dayKey = day.toISOString();
    if (st.dayIso !== dayKey) return;
    const slot = pointToSlot(e.clientY, dayKey);
    if (slot == null) return;
    setDragState({ ...st, endSlot: Math.max(slot + 1, st.startSlot + 1) });
  };
  const onPointerUp = (e: React.PointerEvent, day: Date) => {
    const st = dragStateRef.current;
    if (!st) {
      setDragState(null);
      return;
    }
    setDragState(null);
    if (!onCreate) return;
    const startSlot = Math.min(st.startSlot, st.endSlot - 1);
    const endSlot = Math.max(st.endSlot, st.startSlot + 1);
    const start = slotToDate(day, startSlot);
    const end = slotToDate(day, endSlot);
    if (end.getTime() - start.getTime() >= 15 * 60000) {
      onCreate(start, end);
    }
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // ---------- week navigation hrefs ----------
  const hrefFor = (d: Date) => {
    const base = weekHrefBase ?? '';
    const suffix = weekHrefSuffix ? `&${weekHrefSuffix}` : '';
    return `${base}?date=${format(d, 'yyyy-MM-dd')}${suffix}`;
  };
  const prevHref = hrefFor(subWeeks(cursor, 1));
  const nextHref = hrefFor(addWeeks(cursor, 1));
  const todayHref = hrefFor(new Date());

  return (
    <div className="space-y-3">
      {/* Header / nav */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <a href={prevHref}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm hover:bg-gray-50">
            ←
          </a>
          <a href={todayHref}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm hover:bg-gray-50">
            Today
          </a>
          <a href={nextHref}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm hover:bg-gray-50">
            →
          </a>
          <span className="ml-2 text-sm font-semibold">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
        </div>
        <div className="text-xs text-gray-500 hidden sm:block">
          Click + drag an empty slot to create
        </div>
        <div className="text-xs text-gray-500 sm:hidden">
          Tap &ldquo;+ block&rdquo; on a day to add one
        </div>
      </div>

      {/* Mobile day-list (<640px). Replaces the week-grid because dragging
          a 7-column hour-grid on a phone screen is unusable; PR E. */}
      <MobileDayList
        days={days}
        events={events}
        onCreate={onCreate}
        onEdit={onEdit}
      />

      {/* Desktop week-grid (>=640px). Keeps the drag-to-create UX. */}
      <div className="hidden sm:block overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className="min-w-[760px]">
          {/* Day headers */}
          <div className="grid"
               style={{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }}>
            <div />
            {days.map(d => (
              <div key={d.toISOString()}
                   className={`text-center text-xs font-semibold py-1.5 border-b border-gray-200
                     ${isToday(d) ? 'bg-teal-50 text-teal-800' : 'text-gray-600'}`}>
                <div>{format(d, 'EEE')}</div>
                <div className={`mt-0.5 ${isToday(d) ? 'text-base font-bold' : 'text-sm'}`}>
                  {format(d, 'd')}
                </div>
              </div>
            ))}
          </div>
          {/* Time + day columns */}
          <div className="grid relative"
               style={{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }}>
            {/* Hour label column */}
            <div className="flex flex-col text-[10px] text-gray-400 text-right pr-1">
              {Array.from({ length: hoursInGrid }, (_, i) => {
                const h = i + startHour;
                return (
                  <div key={h} style={{ height: PX_PER_HOUR }} className="-mt-1.5">
                    {format(new Date(2000, 0, 1, h, 0), 'h a')}
                  </div>
                );
              })}
            </div>
            {/* Day cells */}
            {days.map(day => {
              const dayKey = day.toISOString();
              const isTodayCol = isToday(day);
              const dragHere = dragState && dragState.dayIso === dayKey ? dragState : null;
              const dayEvents = events.filter(ev => isSameDay(ev.startsAt, day));
              return (
                <div
                  key={dayKey}
                  ref={el => { gridRefs.current.set(dayKey, el); }}
                  className={`relative border-l border-gray-200 ${isTodayCol ? 'bg-teal-50/30' : ''} select-none touch-none`}
                  style={{ height: hoursInGrid * PX_PER_HOUR }}
                  onPointerDown={(e) => onPointerDown(e, day)}
                  onPointerMove={(e) => onPointerMove(e, day)}
                  onPointerUp={(e) => onPointerUp(e, day)}
                  onPointerCancel={() => setDragState(null)}
                >
                  {/* Hour lines */}
                  {Array.from({ length: hoursInGrid }, (_, i) => (
                    <div key={i}
                      className="absolute inset-x-0 border-b border-gray-100"
                      style={{ top: (i + 1) * PX_PER_HOUR }}
                    />
                  ))}
                  {/* Drag preview */}
                  {dragHere && (() => {
                    const top = Math.min(dragHere.startSlot, dragHere.endSlot - 1) * (PX_PER_HOUR / SLOTS_PER_HOUR);
                    const bottom = Math.max(dragHere.endSlot, dragHere.startSlot + 1) * (PX_PER_HOUR / SLOTS_PER_HOUR);
                    return (
                      <div
                        className="absolute inset-x-1 rounded-md ring-2 ring-teal-500 bg-teal-200/50 pointer-events-none"
                        style={{ top, height: bottom - top }}
                      >
                        <div className="text-[10px] text-teal-900 px-1 py-0.5 font-semibold">
                          {format(slotToDate(day, Math.min(dragHere.startSlot, dragHere.endSlot - 1)), 'h:mm a')} –
                          {' '}{format(slotToDate(day, Math.max(dragHere.endSlot, dragHere.startSlot + 1)), 'h:mm a')}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Events */}
                  {dayEvents.map(ev => {
                    const proj = project(ev, day);
                    if (!proj) return null;
                    const isAvail = ev.variant === 'availability';
                    const baseClass = isAvail
                      ? 'bg-emerald-100/80 text-emerald-900 ring-emerald-200 hover:bg-emerald-200'
                      : 'bg-sky-500 text-white ring-sky-700 hover:bg-sky-600';
                    const stripe = ev.isRecurringInstance
                      ? (isAvail
                        ? 'bg-[repeating-linear-gradient(135deg,rgba(16,185,129,0.18)_0_6px,transparent_6px_12px)]'
                        : 'bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.18)_0_6px,transparent_6px_12px)]')
                      : '';
                    // PR G: Change conflict styling to indicate overlap, not blocking conflict
                    const conflict = ev.hasConflict
                      ? 'ring-2 ring-dashed ring-amber-400 outline outline-1 outline-amber-300'
                      : 'ring-1';
                    return (
                      <button
                        key={ev.occurrenceId}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit?.(ev.occurrenceId); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`absolute inset-x-1 text-left rounded-md px-1.5 py-1 text-[11px] leading-tight overflow-hidden transition shadow-sm ${baseClass} ${conflict}`}
                        style={{ top: proj.top, height: proj.height }}
                      >
                        <div className={`absolute inset-0 rounded-md pointer-events-none ${stripe}`} />
                        <div className="relative flex items-center gap-1 font-semibold truncate">
                          {ev.isRecurringInstance && <span title="Recurring">🔁</span>}
                          {ev.hasConflict && <span title="Overlap">🔄</span>}
                          <span className="truncate">{ev.title}</span>
                        </div>
                        <div className="relative text-[10px] opacity-90 truncate">
                          {format(ev.startsAt, 'h:mm a')}–{format(ev.endsAt, 'h:mm a')}
                          {ev.subtitle && ` · ${ev.subtitle}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-emerald-100 ring-1 ring-emerald-200" />
          Availability
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-sky-500" />
          Shift
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded bg-sky-500 ring-2 ring-red-500" />
          Conflict (override)
        </span>
        <span className="inline-flex items-center gap-1.5">
          🔁 Recurring instance
        </span>
      </div>
    </div>
  );
}

// =====================================================================
// MobileDayList — the mobile (<640px) replacement for the week-grid.
// Renders a vertical scroll of days with each day's events stacked
// underneath. Each day gets a "+ Add block" button that opens the same
// modal the desktop drag-to-create flow does (we synthesize a default
// 9:00–10:00 AM slot on tap).
//
// Rationale: a 7-column hour-grid on a 375px-wide phone screen is
// unusable — horizontal scroll hides 4 of 7 days and there's no
// affordance. Day-list is a better mobile pattern (Google Calendar
// uses the same approach).
// =====================================================================
function MobileDayList({
  days,
  events,
  onCreate,
  onEdit,
}: {
  days: Date[];
  events: WeekEvent[];
  onCreate?: (start: Date, end: Date) => void;
  onEdit?: (occurrenceId: string) => void;
}) {
  return (
    <div className="sm:hidden space-y-2">
      {days.map((day) => {
        const dayEvents = events
          .filter((ev) => isSameDay(ev.startsAt, day))
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        const today = isToday(day);
        return (
          <div
            key={day.toISOString()}
            className={`rounded-lg border ${today ? 'border-teal-300 bg-teal-50/40' : 'border-gray-200 bg-white'} p-3`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`text-sm font-semibold ${today ? 'text-teal-800' : 'text-gray-700'}`}>
                {format(day, 'EEE, MMM d')}
                {today && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide">Today</span>}
              </div>
              {onCreate && (
                <button
                  type="button"
                  onClick={() => {
                    // Synthesize a default 1-hour block at 9 AM local for this day.
                    const start = new Date(day);
                    start.setHours(9, 0, 0, 0);
                    const end = new Date(start.getTime() + 60 * 60 * 1000);
                    onCreate(start, end);
                  }}
                  className="rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-2 py-1"
                >
                  + Add block
                </button>
              )}
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-1.5">
                {dayEvents.map((ev) => {
                  const isAvail = ev.variant === 'availability';
                  const cls = isAvail
                    ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
                    : 'bg-sky-100 ring-sky-300 text-sky-900';
                  // PR G: Change conflict styling to indicate overlap, not blocking conflict
                  const conflictRing = ev.hasConflict ? ' ring-2 ring-dashed ring-amber-400' : ' ring-1';
                  return (
                    <li key={ev.occurrenceId}>
                      <button
                        type="button"
                        onClick={() => onEdit?.(ev.occurrenceId)}
                        className={`w-full text-left rounded-md px-2.5 py-2 ${cls}${conflictRing}`}
                      >
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          {ev.isRecurringInstance && <span title="Recurring">🔁</span>}
                          {ev.hasConflict && <span title="Overlap">🔄</span>}
                          <span className="truncate">{ev.title}</span>
                        </div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {format(ev.startsAt, 'h:mm a')} – {format(ev.endsAt, 'h:mm a')}
                          {ev.subtitle && <span> · {ev.subtitle}</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Re-export so pages can do `import { WeekView, type WeekEvent } …`.
export default WeekView;
