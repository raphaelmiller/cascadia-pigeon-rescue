'use server';

// Server actions for the volunteer-portal Availability + Shifts page.
//
// PR H (2026-05-24) — rewritten to accept the new form shape:
//   - startDate (yyyy-mm-dd) + endDate (yyyy-mm-dd) — defines the span
//   - startTime (HH:MM)      + endTime  (HH:MM)    — defines the daily window
//   - recurring (checkbox)   + byDays[] (SU/MO/...) — optional weekly repeat
//   - customRrule (advanced) — overrides everything when present
//
// We compile to the existing VolunteerAvailability row shape:
//   - kind=one_time / weekly / custom (computed; no UI exposes "always" or
//     "indefinite" anymore — the old kind values are still supported by
//     the engine for backward compat).
//   - startsAt / endsAt = absolute datetimes of the first window
//   - rrule = compiled RRULE (or pasted custom) or null
//   - effectiveUntil = optional cap on recurrence
//
// Volunteers manage their OWN availability here. They cannot see or
// edit anyone else's availability — queries are always scoped by
// profileId from requireVolunteer().

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { expandRange } from '@/lib/scheduling';

// PR H: 'foster_oncall' dropped from the UI (not a real CPR thing). We
// still accept it on writes so any historical rows + URL deep-links
// don't reject — but no surface emits it anymore.
const VALID_SCOPES = ['any', 'rescue', 'transport', 'foster_oncall'] as const;
type Scope = typeof VALID_SCOPES[number];

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function parseDateOnly(raw: string): { y: number; m: number; d: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function parseTimeOnly(raw: string): { h: number; mi: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { h: Number(m[1]), mi: Number(m[2]) };
}

function combineDateTime(d: { y: number; m: number; d: number }, t: { h: number; mi: number }): Date {
  return new Date(d.y, d.m, d.d, t.h, t.mi, 0, 0);
}

function parseEffectiveUntil(raw: string): Date | null {
  const parts = parseDateOnly(raw);
  if (!parts) return null;
  // Use end of that day so the cap is inclusive.
  return new Date(parts.y, parts.m, parts.d, 23, 59, 59, 999);
}

type CompiledForm = {
  kind: 'one_time' | 'weekly' | 'custom';
  startsAt: Date;
  endsAt: Date;
  rrule: string | null;
  effectiveUntil: Date | null;
};

function compileForm(fd: FormData): { ok: true; out: CompiledForm } | { ok: false; reason: 'invalid_dates' | 'invalid_time' } {
  const startDate = parseDateOnly(String(fd.get('startDate') ?? ''));
  const endDateRaw = String(fd.get('endDate') ?? '').trim();
  const endDate = endDateRaw ? parseDateOnly(endDateRaw) : startDate;
  const startTime = parseTimeOnly(String(fd.get('startTime') ?? ''));
  const endTime = parseTimeOnly(String(fd.get('endTime') ?? ''));

  if (!startDate || !endDate) return { ok: false, reason: 'invalid_dates' };
  if (!startTime || !endTime) return { ok: false, reason: 'invalid_time' };

  // First-window absolute times: anchor on the START date.
  const startsAt = combineDateTime(startDate, startTime);
  let endsAt: Date;

  // Daily window must be valid (end > start within a day).
  const dailyEnd = combineDateTime(startDate, endTime);
  if (dailyEnd.getTime() <= startsAt.getTime()) {
    return { ok: false, reason: 'invalid_time' };
  }

  // For a multi-day non-recurring stretch, the "block" runs from
  // startDate@startTime to endDate@endTime as one continuous span.
  if (startDate.y === endDate.y && startDate.m === endDate.m && startDate.d === endDate.d) {
    endsAt = dailyEnd;
  } else {
    endsAt = combineDateTime(endDate, endTime);
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { ok: false, reason: 'invalid_dates' };
    }
  }

  // RRULE compilation.
  const recurring = String(fd.get('recurring') ?? '') === '1';
  const customRrule = String(fd.get('customRrule') ?? '').trim();
  const byDaysRaw = fd.getAll('byDays')
    .map(v => String(v).toUpperCase())
    .filter(v => (DAY_CODES as readonly string[]).includes(v));

  let rrule: string | null = null;
  let kind: 'one_time' | 'weekly' | 'custom' = 'one_time';

  if (customRrule) {
    rrule = customRrule;
    kind = 'custom';
  } else if (recurring) {
    // Default to weekdays in the date range if user didn't tick days.
    let days = byDaysRaw;
    if (days.length === 0) {
      const set = new Set<string>();
      // Walk start to end inclusive.
      const cursor = new Date(startDate.y, startDate.m, startDate.d);
      const last = new Date(endDate.y, endDate.m, endDate.d);
      while (cursor.getTime() <= last.getTime()) {
        set.add(DAY_CODES[cursor.getDay()]);
        cursor.setDate(cursor.getDate() + 1);
      }
      days = Array.from(set);
    }
    rrule = `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
    kind = 'weekly';
  }

  const effectiveUntil = parseEffectiveUntil(String(fd.get('effectiveUntil') ?? ''));

  return { ok: true, out: { kind, startsAt, endsAt, rrule, effectiveUntil } };
}

export async function saveAvailability(formData: FormData): Promise<void> {
  const v = await requireVolunteer();
  const id = String(formData.get('id') ?? '').trim();

  // Scope.
  const scopeRaw = String(formData.get('scope') ?? 'any');
  const scope = (VALID_SCOPES as readonly string[]).includes(scopeRaw) ? scopeRaw as Scope : 'any';

  const compiled = compileForm(formData);
  if (!compiled.ok) {
    redirect(`/shifts?msg=${compiled.reason}`);
  }
  const { kind, startsAt, endsAt, rrule, effectiveUntil } = compiled.out;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  // Conflict warning (advisory only — not a block). Volunteers ARE
  // allowed to set overlapping blocks (e.g. broad weekly + narrow
  // one-time for an extra shift), but we surface a warning so they
  // don't accidentally double-book themselves.
  const overlapping = await detectOverlaps(v.profileId, startsAt, endsAt, kind, rrule, id || null);

  if (id) {
    // Only allow updates on rows the volunteer owns.
    const existing = await prisma.volunteerAvailability.findUnique({
      where: { id },
      select: { profileId: true },
    });
    if (!existing || existing.profileId !== v.profileId) {
      redirect('/shifts?msg=forbidden');
    }
    await prisma.volunteerAvailability.update({
      where: { id },
      data: { kind, scope, startsAt, endsAt, rrule, effectiveUntil, notes },
    });
  } else {
    await prisma.volunteerAvailability.create({
      data: { profileId: v.profileId, kind, scope, startsAt, endsAt, rrule, effectiveUntil, notes },
    });
  }
  revalidatePath('/shifts');
  if (overlapping > 0) {
    redirect(`/shifts?msg=saved_with_overlap:${overlapping}`);
  }
  redirect('/shifts?msg=saved');
}

async function detectOverlaps(
  profileId: string,
  startsAt: Date,
  endsAt: Date,
  kind: string,
  rrule: string | null,
  excludeId: string | null,
): Promise<number> {
  // "always" overlaps everything; don't double-count.
  if (kind === 'always') return 0;

  const others = await prisma.volunteerAvailability.findMany({
    where: { profileId, id: excludeId ? { not: excludeId } : undefined },
    select: { id: true, kind: true, startsAt: true, endsAt: true, rrule: true },
  });

  // Build the new row's first occurrence(s) within +/- 7 days of
  // startsAt -- enough to catch realistic clashes without scanning the
  // infinite RRULE.
  const windowStart = new Date(startsAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(endsAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const newOccs = expandRange([{ id: 'new', startsAt, endsAt, rrule }], windowStart, windowEnd);
  const otherOccs = expandRange(others, windowStart, windowEnd);

  let overlaps = 0;
  for (const n of newOccs) {
    for (const o of otherOccs) {
      // "always" rows are represented as huge spans; count them once.
      if (o.sourceId !== 'new' &&
          n.occurrenceStartsAt < o.occurrenceEndsAt &&
          n.occurrenceEndsAt > o.occurrenceStartsAt) {
        overlaps++;
      }
    }
  }
  return overlaps;
}

export async function deleteAvailability(formData: FormData): Promise<void> {
  const v = await requireVolunteer();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/shifts');
  const existing = await prisma.volunteerAvailability.findUnique({
    where: { id },
    select: { profileId: true },
  });
  if (!existing || existing.profileId !== v.profileId) {
    redirect('/shifts?msg=forbidden');
  }
  await prisma.volunteerAvailability.delete({ where: { id } });
  revalidatePath('/shifts');
  redirect('/shifts?msg=deleted');
}
