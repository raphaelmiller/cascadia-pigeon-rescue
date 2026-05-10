'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, addMonths, subMonths,
} from 'date-fns';

/**
 * CalendarDatePopover — a "Today" / selected-date button that opens a
 * mini month grid for jumping to any day. The basePath is the calendar
 * route (e.g. /calendar). The selected day and current month are passed
 * back via ?month=YYYY-MM&day=YYYY-MM-DD, plus any preserved extra
 * query params (like ?tab=transport).
 */
export function CalendarDatePopover({
  basePath,
  monthCursor,    // YYYY-MM string of the month being viewed
  selectedDay,    // YYYY-MM-DD string of the selected day
  extraParams = {},
}: {
  basePath: string;
  monthCursor: string;
  selectedDay: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [popMonth, setPopMonth] = useState<Date>(() => {
    const [y, m] = monthCursor.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
  });
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Re-anchor the popover to the current month whenever it opens.
  useEffect(() => {
    if (open) {
      const [y, m] = monthCursor.split('-').map(Number);
      setPopMonth(new Date(y, (m || 1) - 1, 1));
    }
  }, [open, monthCursor]);

  const days = useMemo(() => {
    const ms = startOfMonth(popMonth);
    const me = endOfMonth(popMonth);
    return eachDayOfInterval({ start: startOfWeek(ms, { weekStartsOn: 0 }), end: endOfWeek(me, { weekStartsOn: 0 }) });
  }, [popMonth]);

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedDay.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [selectedDay]);

  const buttonLabel = isToday(selectedDate)
    ? `Today · ${format(selectedDate, 'MMM d')}`
    : format(selectedDate, 'EEE, MMM d');

  function buildHref(month: string, day: string) {
    const params = new URLSearchParams({ ...extraParams, month, day });
    return `${basePath}?${params.toString()}`;
  }

  function go(day: Date) {
    const month = format(day, 'yyyy-MM');
    const dayKey = format(day, 'yyyy-MM-dd');
    setOpen(false);
    router.push(buildHref(month, dayKey));
  }

  function jumpToToday() {
    const now = new Date();
    go(now);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-teal-50 text-teal-800 ring-1 ring-teal-200 hover:bg-teal-100 transition"
      >
        📅 <span>{buttonLabel}</span>
        <span className="text-teal-600">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-40 w-[280px] rounded-xl bg-white shadow-lg ring-1 ring-gray-200 p-3">
          {/* Header: month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setPopMonth(subMonths(popMonth, 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
              aria-label="Previous month"
            >
              ←
            </button>
            <div className="text-sm font-semibold">{format(popMonth, 'MMMM yyyy')}</div>
            <button
              type="button"
              onClick={() => setPopMonth(addMonths(popMonth, 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
              aria-label="Next month"
            >
              →
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-px text-[10px] font-semibold text-gray-400 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="h-6 flex items-center justify-center">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-px">
            {days.map(day => {
              const inMonth = isSameMonth(day, popMonth);
              const isSel = isSameDay(day, selectedDate);
              const td = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => go(day)}
                  className={`h-8 text-xs rounded-md transition ${
                    isSel
                      ? 'bg-teal-600 text-white font-semibold'
                      : td
                      ? 'bg-teal-50 text-teal-800 font-semibold ring-1 ring-teal-300'
                      : inMonth
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
            <button
              type="button"
              onClick={jumpToToday}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              Jump to today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
