// PR G (2026-05-19) — Current Whereabouts derivation.
//
// "Current whereabouts" surfaces on the bird list page and on the bird
// detail page summary. It's DERIVED, not stored:
//
//   1. If the bird has any WhereaboutsLogEntry rows, the latest one
//      (highest recordedAt) wins. Its category is the whereabouts and
//      its notes appear inline.
//
//   2. Otherwise, fall back to a mapping from Bird.status so historical
//      birds (created before this PR) still get a reasonable answer
//      without a backfill migration.
//
// Keeping derivation in one place means there's exactly one rule the
// app obeys, and changing it is a one-file edit. The previous design
// (separate enum column on Bird) was rejected because it would have
// duplicated `status` and the two values would drift the moment an
// operator updated status without remembering to update whereabouts.

import {
  WHEREABOUTS_CATEGORIES,
  WHEREABOUTS_LABELS,
  WHEREABOUTS_TONE,
  type WhereaboutsCategory,
} from './constants';

/**
 * Minimal shape we need from a log entry. Lets callers pass
 * `prisma.whereaboutsLogEntry.findMany(...)` results directly, or a
 * lighter projection for the list page.
 */
export type WhereaboutsLogEntryLite = {
  category: string;
  notes: string | null;
  recordedAt: Date;
  recordedBy?: string | null;
};

/** Mapping from Bird.status -> whereabouts category for fallback. */
const STATUS_TO_WHEREABOUTS: Record<string, WhereaboutsCategory> = {
  // Adopted family
  adopted: 'adopted',
  adoption_pending: 'adopted',         // close enough for the summary
  adoption_ready: 'in_foster_care',    // ready but not yet placed

  // Foster family
  in_foster: 'in_foster_care',
  long_term_foster: 'in_foster_care',

  // Wildlife / vet family
  at_vet: 'at_wildlife_center',
  medical_hold: 'at_wildlife_center',

  // Sanctuary
  sanctuary: 'at_sanctuary',

  // End states
  deceased: 'deceased',

  // Intake / unknown / closed -> Other
  needs_intake: 'other',
  needs_foster: 'other',
  needs_transfer: 'other',
  transferred: 'other',
  released: 'other',
  closed: 'other',
};

export type WhereaboutsSummary = {
  category: WhereaboutsCategory;
  label: string;
  tone: string;
  /** Where this answer came from. Useful for telling the UI whether to
   *  show "notes" (only available on log entries) or just the status. */
  source: 'log' | 'status_fallback';
  notes?: string | null;
  recordedAt?: Date;
  recordedBy?: string | null;
};

/**
 * Compute the current whereabouts for a bird.
 *
 * @param logEntries  All WhereaboutsLogEntry rows for the bird. Order
 *                    doesn't matter — we pick MAX(recordedAt) ourselves.
 *                    Pass `[]` if the caller hasn't fetched them.
 * @param status      Bird.status fallback when there are no log entries.
 */
export function deriveWhereabouts(
  logEntries: WhereaboutsLogEntryLite[] | undefined | null,
  status: string | undefined | null,
): WhereaboutsSummary {
  const latest = pickLatest(logEntries ?? []);
  if (latest) {
    const cat = normalizeCategory(latest.category);
    return {
      category: cat,
      label: WHEREABOUTS_LABELS[cat] ?? WHEREABOUTS_LABELS.other,
      tone: WHEREABOUTS_TONE[cat] ?? WHEREABOUTS_TONE.other,
      source: 'log',
      notes: latest.notes ?? null,
      recordedAt: latest.recordedAt,
      recordedBy: latest.recordedBy ?? null,
    };
  }
  const cat = STATUS_TO_WHEREABOUTS[(status ?? '').toLowerCase()] ?? 'other';
  return {
    category: cat,
    label: WHEREABOUTS_LABELS[cat] ?? WHEREABOUTS_LABELS.other,
    tone: WHEREABOUTS_TONE[cat] ?? WHEREABOUTS_TONE.other,
    source: 'status_fallback',
  };
}

function pickLatest(
  entries: WhereaboutsLogEntryLite[],
): WhereaboutsLogEntryLite | undefined {
  if (entries.length === 0) return undefined;
  let best = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].recordedAt > best.recordedAt) best = entries[i];
  }
  return best;
}

function normalizeCategory(raw: string): WhereaboutsCategory {
  const lower = (raw ?? '').toLowerCase();
  return (WHEREABOUTS_CATEGORIES as readonly string[]).includes(lower)
    ? (lower as WhereaboutsCategory)
    : 'other';
}
