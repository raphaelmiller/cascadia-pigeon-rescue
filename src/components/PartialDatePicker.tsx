'use client';

import { useEffect, useMemo, useState } from 'react';
import { inputClass } from '@/components/ui';
import {
  MONTH_OPTIONS,
  yearChoices,
  daysInMonth,
} from '@/lib/partialDate';

/**
 * Three-part date picker for approximate historical dates.
 *
 * - Year is required to record anything (server-side drops month+day if year is missing)
 * - Month is optional ("—" leaves it blank, day becomes locked out)
 * - Day is optional, dynamically capped to the selected month/year
 *
 * Emits hidden inputs `${name}Year`, `${name}Month`, `${name}Day` so
 * the server action / Zod schema can read the triple unchanged.
 *
 * `defaultValue` lets edit forms pre-fill the current values. Pass nulls
 * for missing components.
 */
export type PartialDatePickerProps = {
  name: string;
  defaultValue?: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
};

export function PartialDatePicker({ name, defaultValue }: PartialDatePickerProps) {
  const years = useMemo(() => yearChoices(), []);
  const [year, setYear] = useState<string>(defaultValue?.year ? String(defaultValue.year) : '');
  const [month, setMonth] = useState<string>(defaultValue?.month ? String(defaultValue.month) : '');
  const [day, setDay] = useState<string>(defaultValue?.day ? String(defaultValue.day) : '');

  const monthDisabled = year === '';
  const dayDisabled = monthDisabled || month === '';
  const dayCap = daysInMonth(
    year === '' ? null : Number(year),
    month === '' ? null : Number(month),
  );

  // If the user reduces the month length (e.g. switching Mar -> Feb) and
  // the selected day no longer fits, drop it.
  useEffect(() => {
    if (day !== '' && Number(day) > dayCap) setDay('');
  }, [dayCap, day]);

  // If year is cleared, blank everything below it.
  useEffect(() => {
    if (year === '') {
      if (month !== '') setMonth('');
      if (day !== '') setDay('');
    }
  }, [year, month, day]);

  const dayOptions: number[] = [];
  for (let i = 1; i <= dayCap; i++) dayOptions.push(i);

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        aria-label="Year"
        className={inputClass}
        value={year}
        onChange={(e) => setYear(e.target.value)}
      >
        <option value="">— Year —</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <select
        aria-label="Month"
        className={inputClass}
        value={month}
        disabled={monthDisabled}
        onChange={(e) => setMonth(e.target.value)}
      >
        <option value="">— Month —</option>
        {MONTH_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      <select
        aria-label="Day"
        className={inputClass}
        value={day}
        disabled={dayDisabled}
        onChange={(e) => setDay(e.target.value)}
      >
        <option value="">— Day —</option>
        {dayOptions.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Hidden inputs surface the chosen values in the FormData payload. */}
      <input type="hidden" name={`${name}Year`} value={year} />
      <input type="hidden" name={`${name}Month`} value={month} />
      <input type="hidden" name={`${name}Day`} value={day} />
    </div>
  );
}
