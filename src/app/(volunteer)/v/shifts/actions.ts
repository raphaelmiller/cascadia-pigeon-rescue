'use server';

// Server actions for the volunteer-portal Availability + Shifts page.
//
// Volunteers manage their OWN availability here. They cannot see or
// edit anyone else's availability -- queries are always scoped by
// profileId from requireVolunteer().

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { expandRange } from '@/lib/scheduling';

const VALID_KINDS = ['one_time', 'weekly', 'indefinite', 'always', 'custom'] as const;
const VALID_SCOPES = ['any', 'rescue', 'transport', 'foster_oncall'] as const;

type Kind = typeof VALID_KINDS[number];
type Scope = typeof VALID_SCOPES[number];

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function compileRRule(kind: Kind, startsAt: Date, customRrule?: string, byDays?: string): string | null {
  // 'always' & 'one_time' have no rrule.
  if (kind === 'one_time' || kind === 'always') return null;
  if (kind === 'custom') {
    const s = (customRrule || '').trim();
    return s || null;
  }
  // weekly + indefinite use the same rrule shape; difference is just
  // lifecycle/UI semantics, the engine treats them identically.
  // BYDAY selection is optional -- if not provided, default to the
  // weekday of startsAt.
  const days = (byDays || '').trim();
  if (days) {
    return `FREQ=WEEKLY;BYDAY=${days}`;
  }
  const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return `FREQ=WEEKLY;BYDAY=${dayNames[startsAt.getDay()]}`;
}

export async function saveAvailability(formData: FormData): Promise<void> {
  const v = await requireVolunteer();
  const id = String(formData.get('id') ?? '').trim();
  const kindRaw = String(formData.get('kind') ?? '');
  const scopeRaw = String(formData.get('scope') ?? 'any');
  const kind = (VALID_KINDS as readonly string[]).includes(kindRaw) ? kindRaw as Kind : 'one_time';
  const scope = (VALID_SCOPES as readonly string[]).includes(scopeRaw) ? scopeRaw as Scope : 'any';

  const startsAtRaw = String(formData.get('startsAt') ?? '');
  const endsAtRaw = String(formData.get('endsAt') ?? '');
  const effectiveUntilRaw = String(formData.get('effectiveUntil') ?? '');
  const byDays = String(formData.get('byDays') ?? '');
  const customRrule = String(formData.get('customRrule') ?? '');
  const notes = String(formData.get('notes') ?? '').trim() || null;

  // 'always' doesn't need start/end -- synthesize a window so the row is valid.
  let startsAt: Date;
  let endsAt: Date;
  if (kind === 'always') {
    startsAt = new Date('2000-01-01T00:00:00Z');
    endsAt = new Date('2100-01-01T00:00:00Z');
  } else {
    const s = parseDate(startsAtRaw);
    const e = parseDate(endsAtRaw);
    if (!s || !e) {
      redirect('/shifts?msg=invalid_dates');
    }
    if (e.getTime() <= s.getTime()) {
      redirect('/shifts?msg=invalid_dates');
    }
    startsAt = s;
    endsAt = e;
  }

  const rrule = compileRRule(kind, startsAt, customRrule, byDays);
  const effectiveUntil = parseDate(effectiveUntilRaw);

  // Conflict warning (advisory only -- not a block). Volunteers ARE
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
