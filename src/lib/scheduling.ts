// Cascadia Pigeon Rescue — scheduling primitives.
//
// One module to centralise:
//   • RRULE preset compilation (UI buttons → iCal string)
//   • Expansion of a recurring availability/shift row into individual
//     occurrence objects, bounded by a [windowStart, windowEnd] range
//   • Conflict detection (out-of-availability + double-booking),
//     warn-only (returns string[] of human-readable warnings)
//
// The intent is that pages call `expandWeek(rows, windowStart, windowEnd)`
// once per render with the full week's worth of rows. RRULE.between() is
// O(occurrences-in-window), not O(occurrences-since-DTSTART), so this is
// cheap. The recurring rows store the FIRST occurrence on
// startsAt/endsAt; we keep the duration constant across instances.
//
// Recurring conflict-check scope: only the NEXT 4 occurrences from "now"
// are considered when saving a recurring shift. Anything beyond that is
// deferred to Phase 2 (we'd need an explicit override-per-occurrence UI
// to be useful).

import { RRule, rrulestr } from 'rrule';
import { addWeeks, addDays, startOfDay, endOfDay } from 'date-fns';

// ----------------------------------------------------------------
// PRESETS — strings shown on the recurrence dropdown / button row,
// compiled to RRULE iCal strings at submit time.
// ----------------------------------------------------------------

export type RecurrencePreset =
  | 'once'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom';

export const RECURRENCE_PRESETS: { key: RecurrencePreset; label: string }[] = [
  { key: 'once',     label: 'Does not repeat' },
  { key: 'daily',    label: 'Every day' },
  { key: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { key: 'weekly',   label: 'Every week on this day' },
  { key: 'biweekly', label: 'Every other week on this day' },
  { key: 'monthly',  label: 'Monthly on this date' },
  { key: 'custom',   label: 'Custom (RRULE string)' },
];

const DAYS_OF_WEEK = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
const WEEKDAYS    = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];

/**
 * Compile a preset + the block's startsAt into an iCal RRULE string.
 * Returns `null` for the 'once' case (= one-off, no rrule column).
 * Returns the custom string verbatim for 'custom'.
 *
 * For 'weekly' / 'biweekly' we anchor BYDAY to the weekday of startsAt
 * so "every week on this day" reads correctly to the user.
 *
 * For 'monthly' we anchor BYMONTHDAY to the day-of-month of startsAt.
 * Edge case: day 29-31 in months that don't have it. The rrule library
 * skips those months by default, which is the safest behaviour for
 * volunteer scheduling — better to skip than to silently snap to the
 * last day of the month.
 */
export function compilePreset(
  preset: RecurrencePreset,
  startsAt: Date,
  customRrule?: string,
): string | null {
  if (preset === 'once') return null;
  if (preset === 'custom') {
    const s = (customRrule || '').trim();
    if (!s) return null;
    // Re-serialize through rrulestr so we don't store invalid input.
    try {
      const parsed = rrulestr(s, { dtstart: startsAt });
      return parsed.toString().replace(/^DTSTART[^\n]*\n?/, '');
    } catch {
      return null;
    }
  }
  const dtstart = startsAt;
  const weekdayIdx = startsAt.getDay(); // 0..6, 0=Sun
  switch (preset) {
    case 'daily':
      return new RRule({ freq: RRule.DAILY, dtstart }).toString().replace(/^DTSTART[^\n]*\n?/, '');
    case 'weekdays':
      return new RRule({ freq: RRule.WEEKLY, byweekday: WEEKDAYS, dtstart })
        .toString().replace(/^DTSTART[^\n]*\n?/, '');
    case 'weekly':
      return new RRule({
        freq: RRule.WEEKLY,
        byweekday: [DAYS_OF_WEEK[weekdayIdx]],
        dtstart,
      }).toString().replace(/^DTSTART[^\n]*\n?/, '');
    case 'biweekly':
      return new RRule({
        freq: RRule.WEEKLY,
        interval: 2,
        byweekday: [DAYS_OF_WEEK[weekdayIdx]],
        dtstart,
      }).toString().replace(/^DTSTART[^\n]*\n?/, '');
    case 'monthly':
      return new RRule({
        freq: RRule.MONTHLY,
        bymonthday: [startsAt.getDate()],
        dtstart,
      }).toString().replace(/^DTSTART[^\n]*\n?/, '');
  }
}

/**
 * Best-effort human label for a stored RRULE string. Used in the modal
 * recurrence preview ("Repeats every week on Monday") and in list rows
 * showing "🔁 weekly".
 */
export function describeRrule(rrule: string | null | undefined, startsAt: Date): string {
  if (!rrule) return 'Does not repeat';
  try {
    const r = rrulestr(rrule, { dtstart: startsAt });
    const text = r.toText();
    // rrule's toText returns "every week on Monday" lowercase; capitalize.
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return 'Custom repeat';
  }
}

// ----------------------------------------------------------------
// EXPANSION
// ----------------------------------------------------------------

export type SchedulableRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  rrule: string | null;
};

export type Occurrence<T extends SchedulableRow> = T & {
  /**
   * Stable composite id for the rendered occurrence.
   * For one-offs: equal to row.id.
   * For recurring instances: `${row.id}__${occurrenceStartISO}`.
   */
  occurrenceId: string;
  sourceId: string;
  isRecurringInstance: boolean;
  /** The original row.startsAt is preserved on `startsAt` of the occurrence object */
  occurrenceStartsAt: Date;
  occurrenceEndsAt: Date;
};

/**
 * Expand a mix of one-off and recurring rows into individual occurrence
 * objects that fall (at least partially) inside [windowStart, windowEnd].
 *
 * Rules:
 *   • A one-off row (rrule == null) is included if its [startsAt, endsAt]
 *     overlaps [windowStart, windowEnd].
 *   • A recurring row is expanded by rrule.between() with `inc=true` on
 *     both ends; each occurrence inherits the row's duration.
 *   • The occurrence preserves all original row fields (so callers can
 *     read `volunteerId`, `role`, `status`, etc. unchanged).
 *
 * Performance note: rrule.between() is bounded by the window; we never
 * fan out the full infinite series.
 */
export function expandRange<T extends SchedulableRow>(
  rows: T[],
  windowStart: Date,
  windowEnd: Date,
): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const row of rows) {
    const duration = row.endsAt.getTime() - row.startsAt.getTime();
    if (!row.rrule) {
      // One-off: overlap test.
      if (row.endsAt >= windowStart && row.startsAt <= windowEnd) {
        out.push({
          ...row,
          occurrenceId: row.id,
          sourceId: row.id,
          isRecurringInstance: false,
          occurrenceStartsAt: row.startsAt,
          occurrenceEndsAt: row.endsAt,
        });
      }
      continue;
    }
    // Recurring: expand.
    let starts: Date[] = [];
    try {
      const r = rrulestr(row.rrule, { dtstart: row.startsAt });
      starts = r.between(windowStart, windowEnd, true);
    } catch {
      // Invalid stored RRULE — fall back to the first occurrence so the
      // user can at least see + edit the broken row.
      if (row.endsAt >= windowStart && row.startsAt <= windowEnd) starts = [row.startsAt];
    }
    for (const occStart of starts) {
      const occEnd = new Date(occStart.getTime() + duration);
      out.push({
        ...row,
        occurrenceId: `${row.id}__${occStart.toISOString()}`,
        sourceId: row.id,
        isRecurringInstance: true,
        occurrenceStartsAt: occStart,
        occurrenceEndsAt: occEnd,
      });
    }
  }
  // Stable order by start time.
  out.sort((a, b) => a.occurrenceStartsAt.getTime() - b.occurrenceStartsAt.getTime());
  return out;
}

/**
 * Return the next N occurrences of a row, starting at `from` (inclusive).
 * Used for:
 *   • Modal preview ("Next: Mon May 18, Mon May 25, Mon Jun 1")
 *   • Conflict-check bounded scope (we check the next 4 occurrences
 *     when saving a recurring shift; further-out conflicts are deferred
 *     to Phase 2).
 */
export function nextOccurrences(
  row: SchedulableRow,
  n: number,
  from: Date = new Date(),
): { startsAt: Date; endsAt: Date }[] {
  const duration = row.endsAt.getTime() - row.startsAt.getTime();
  if (!row.rrule) {
    if (row.startsAt >= from) return [{ startsAt: row.startsAt, endsAt: row.endsAt }];
    return [];
  }
  try {
    const r = rrulestr(row.rrule, { dtstart: row.startsAt });
    // Look ~2 years ahead at most — plenty for "next 3 occurrences" of any
    // reasonable schedule, and bounded so misconfigured rules can't hang.
    const horizon = addWeeks(from, 104);
    const starts = r.between(from, horizon, true).slice(0, n);
    return starts.map(s => ({ startsAt: s, endsAt: new Date(s.getTime() + duration) }));
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------
// CONFLICT DETECTION — warn, don't block.
// ----------------------------------------------------------------

export type ConflictInput = {
  /** The shift being created/edited (its concrete window). */
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  /** If this is a recurring shift save, the rrule + how many occurrences to check. */
  shiftRrule?: string | null;
  occurrencesToCheck?: number; // default 4 — explicit Phase-1 scope cap
  /** Display name of the person being assigned (used in warning text). */
  assigneeName: string;
  /** All current availability rows for the assignee (one-off + recurring). */
  availabilities: SchedulableRow[];
  /** All current OTHER shifts for the assignee (excluding the row being edited if any). */
  otherShifts: (SchedulableRow & { role?: string | null })[];
};

/**
 * Returns a list of human-readable warnings. Empty array == no conflicts.
 *
 * Algorithm:
 *   1. Build the list of concrete occurrences for the shift being saved
 *      (one if non-recurring, up to N if recurring).
 *   2. For each occurrence:
 *      a. Out-of-availability: is there at least one availability block
 *         (one-off or recurring) whose window fully covers the shift
 *         occurrence? If not → warn.
 *      b. Double-booking: does any other shift occurrence overlap this
 *         occurrence? If so → warn.
 *
 * Recurring-shift Phase-1 scope: only the first `occurrencesToCheck`
 * (default 4) future shift instances are checked. A full pre-flight
 * across the entire infinite series isn't tractable without a per-
 * occurrence override UI, which is deferred to Phase 2.
 */
export function detectConflicts(input: ConflictInput): string[] {
  const {
    shiftStartsAt, shiftEndsAt, shiftRrule, occurrencesToCheck = 4,
    assigneeName, availabilities, otherShifts,
  } = input;

  // 1. Build the list of concrete shift instances we'll check.
  const duration = shiftEndsAt.getTime() - shiftStartsAt.getTime();
  let shiftInstances: { startsAt: Date; endsAt: Date }[];
  if (!shiftRrule) {
    shiftInstances = [{ startsAt: shiftStartsAt, endsAt: shiftEndsAt }];
  } else {
    try {
      const r = rrulestr(shiftRrule, { dtstart: shiftStartsAt });
      // Check starting at the FIRST occurrence (= shiftStartsAt), not "now",
      // so saving a recurring shift that starts in the past still gets its
      // first few real occurrences validated.
      const horizonStart = shiftStartsAt;
      const horizonEnd = addWeeks(shiftStartsAt, 52);
      const starts = r.between(horizonStart, horizonEnd, true).slice(0, occurrencesToCheck);
      shiftInstances = starts.map(s => ({ startsAt: s, endsAt: new Date(s.getTime() + duration) }));
    } catch {
      shiftInstances = [{ startsAt: shiftStartsAt, endsAt: shiftEndsAt }];
    }
  }

  // 2. Pre-expand availability + other shifts across a window that covers
  // every shift instance, padded by a day on each side.
  const wStart = startOfDay(shiftInstances[0]?.startsAt ?? shiftStartsAt);
  const wEnd = endOfDay(
    new Date(Math.max(...shiftInstances.map(s => s.endsAt.getTime())) + 86400000)
  );
  const availOccs = expandRange(availabilities, wStart, wEnd);
  const otherShiftOccs = expandRange(otherShifts as SchedulableRow[], wStart, wEnd);

  const warnings: string[] = [];
  for (const inst of shiftInstances) {
    // (a) Out-of-availability: is the shift fully inside any availability block?
    const covered = availOccs.some(a =>
      a.occurrenceStartsAt <= inst.startsAt && a.occurrenceEndsAt >= inst.endsAt
    );
    if (!covered) {
      warnings.push(
        `${assigneeName} isn't marked available for ${fmtRange(inst.startsAt, inst.endsAt)}.`
      );
    }
    // (b) Double-booking: overlap with any other shift instance.
    for (const other of otherShiftOccs) {
      if (other.occurrenceStartsAt < inst.endsAt && other.occurrenceEndsAt > inst.startsAt) {
        warnings.push(
          `${assigneeName} is double-booked with another shift on ${fmtRange(other.occurrenceStartsAt, other.occurrenceEndsAt)}.`
        );
      }
    }
  }
  return warnings;
}

function fmtRange(a: Date, b: Date): string {
  const sameDay = a.toDateString() === b.toDateString();
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const day = a.toLocaleDateString(undefined, opts);
  const t1 = a.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const t2 = b.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `${day} ${t1}–${t2}`;
  const day2 = b.toLocaleDateString(undefined, opts);
  return `${day} ${t1} → ${day2} ${t2}`;
}

// ----------------------------------------------------------------
// SMALL UTILITIES used by the modal + pages.
// ----------------------------------------------------------------

/**
 * Round a Date to the nearest 15-minute boundary. Used by the drag-to-
 * create handler so blocks always snap to quarter-hour increments.
 */
export function snapTo15(d: Date): Date {
  const ms = 15 * 60 * 1000;
  return new Date(Math.round(d.getTime() / ms) * ms);
}

/**
 * Convert a Date to the `<input type="datetime-local">` value format,
 * preserving local time (the input does NOT accept a timezone offset).
 */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
}
