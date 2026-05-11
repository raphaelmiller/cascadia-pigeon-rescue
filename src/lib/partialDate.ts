/**
 * Partial-date utilities.
 *
 * A "partial date" is a (year, month?, day?) triple where year is required
 * and month + day are optional. It lets the UI capture approximate
 * historical dates — e.g. "found in March 2024" or "joined in 2022" —
 * without forcing the operator to invent precision they don't have.
 *
 * Stored on the row as three nullable Int columns so SQLite can index /
 * sort them cheaply. Never reconstructed into a JS Date because that
 * would imply precision we don't have.
 */

export type PartialDate = {
  year: number | null;
  month: number | null; // 1..12
  day: number | null;   // 1..31
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Days in month, with Feb leap-year aware. */
export function daysInMonth(year: number | null, month: number | null): number {
  if (!month) return 31;
  if (month === 2) {
    if (year && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29;
    return 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

/** Render a partial date for display. Returns null when year is missing. */
export function formatPartialDate(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined,
  opts: { short?: boolean } = {},
): string | null {
  if (!year) return null;
  if (!month) return String(year);
  const monthName = (opts.short ? MONTH_NAMES_SHORT : MONTH_NAMES)[month - 1];
  if (!day) return `${monthName} ${year}`;
  return `${monthName} ${day}, ${year}`;
}

/**
 * Pull a partial-date triple out of FormData. Form fields are expected
 * to be `${prefix}Year`, `${prefix}Month`, `${prefix}Day`. Empty strings
 * coerce to null.
 *
 * If the year is missing, the whole triple is null even when month/day
 * were filled in — months without years are meaningless.
 */
export function readPartialDate(formData: FormData, prefix: string): PartialDate {
  const y = formData.get(`${prefix}Year`);
  const m = formData.get(`${prefix}Month`);
  const d = formData.get(`${prefix}Day`);

  const year = y && String(y).trim() !== '' ? clampInt(Number(y), 1900, 2100) : null;
  if (year === null) return { year: null, month: null, day: null };

  let month = m && String(m).trim() !== '' ? clampInt(Number(m), 1, 12) : null;
  let day = d && String(d).trim() !== '' ? clampInt(Number(d), 1, daysInMonth(year, month)) : null;

  // Day without month is nonsense — drop it.
  if (!month) day = null;

  return { year, month, day };
}

/** Years to show in the picker dropdown, descending. */
export function yearChoices(): number[] {
  const now = new Date().getFullYear();
  const start = now + 1; // allow "next year" for future-planning use
  const years: number[] = [];
  for (let y = start; y >= now - 30; y--) years.push(y);
  return years;
}

export const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));

function clampInt(n: number, min: number, max: number): number | null {
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min || i > max) return null;
  return i;
}
