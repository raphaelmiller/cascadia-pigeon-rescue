// Shared action helpers used by the 4 PR-B server-action files.
// Pure server-side — no client imports.

import { compilePreset, type RecurrencePreset, detectConflicts } from './scheduling';

export type ParsedBlock = {
  id: string | null;
  startsAt: Date;
  endsAt: Date;
  rrule: string | null;
  notes: string | null;
  override: boolean;
  volunteerId: string | null;
  // shift-only
  role: string | null;
  status: string | null;
};

const VALID_STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']);

/**
 * Pull the modal's FormData into a typed record. Throws on invalid
 * start/end timestamps so callers can return a friendly error.
 */
export function parseBlockForm(fd: FormData): ParsedBlock {
  const id = String(fd.get('id') || '') || null;
  const startsRaw = String(fd.get('startsAt') || '');
  const endsRaw = String(fd.get('endsAt') || '');
  const startsAt = new Date(startsRaw);
  const endsAt = new Date(endsRaw);
  if (!startsRaw || !endsRaw || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error('Start and end are required and must be valid timestamps.');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('End must be after start.');
  }
  const preset = (String(fd.get('preset') || 'once') as RecurrencePreset);
  const customRrule = String(fd.get('customRrule') || '');
  const rrule = compilePreset(preset, startsAt, customRrule);
  const status = String(fd.get('status') || 'scheduled');
  return {
    id,
    startsAt,
    endsAt,
    rrule,
    notes: (String(fd.get('notes') || '').trim() || null),
    override: fd.get('override') === '1',
    volunteerId: String(fd.get('volunteerId') || '') || null,
    role: (String(fd.get('role') || '').trim() || null),
    status: VALID_STATUSES.has(status) ? status : 'scheduled',
  };
}

/**
 * Run the warn-only conflict check for a shift save. Returns the
 * warning list (empty when there are no conflicts, or when the user
 * has already overridden).
 */
export async function runShiftConflictCheck(args: {
  block: ParsedBlock;
  assigneeName: string;
  loadAvailabilities: () => Promise<{ id: string; startsAt: Date; endsAt: Date; rrule: string | null }[]>;
  loadOtherShifts: () => Promise<{ id: string; startsAt: Date; endsAt: Date; rrule: string | null; role?: string | null }[]>;
}): Promise<string[]> {
  const { block, assigneeName, loadAvailabilities, loadOtherShifts } = args;
  if (block.override) return [];
  if (!block.volunteerId) return []; // unassigned shift — no one to conflict with
  const [availabilities, otherShifts] = await Promise.all([
    loadAvailabilities(),
    loadOtherShifts(),
  ]);
  return detectConflicts({
    shiftStartsAt: block.startsAt,
    shiftEndsAt: block.endsAt,
    shiftRrule: block.rrule,
    occurrencesToCheck: 4,
    assigneeName,
    availabilities,
    otherShifts,
  });
}
