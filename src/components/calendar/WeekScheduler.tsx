'use client';

// =====================================================================
// WeekScheduler — client glue that ties WeekView + ScheduleBlockModal
// together for a single page. The server-side page passes in:
//
//   • the pre-expanded WeekEvents (one-off + recurring occurrences,
//     already projected onto the visible week range — heavy lifting
//     done server-side via expandRange()),
//   • the raw rows so we can re-hydrate the modal on edit click,
//   • the assignees list,
//   • the save + delete server actions (already domain-bound).
//
// The wrapper owns no business logic — every save / delete trip goes
// through the parent's server actions so conflict detection + revalidation
// stay server-side.
// =====================================================================

import { useMemo, useState } from 'react';
import { WeekView, type WeekEvent } from './WeekView';
import { ScheduleBlockModal, type ScheduleModalState, type ModalAssignee } from './ScheduleBlockModal';
import type { SaveResult } from '@/lib/scheduling-actions';

export type WeekSchedulerRow = {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  rrule: string | null;
  notes: string | null;
  volunteerId: string | null;
  // shift-only:
  role?: string | null;
  status?: string | null;
};

export type WeekSchedulerProps = {
  kind: 'availability' | 'shift';
  cursor: Date | string;
  /** Pre-computed events for the visible week. */
  events: (Omit<WeekEvent, 'startsAt' | 'endsAt'> & { startsAt: Date | string; endsAt: Date | string })[];
  /** Raw rows keyed by id — used to re-hydrate the modal in edit mode. */
  rows: WeekSchedulerRow[];
  /** Volunteer dropdown options. */
  assignees: ModalAssignee[];
  /** When set, the assignee picker is hidden + locked (per-person pages). */
  lockedVolunteerId?: string;
  assigneeLabel?: string;
  /** Server actions, pre-bound by the page. */
  saveAction: (fd: FormData) => Promise<SaveResult>;
  deleteAction?: (id: string) => Promise<SaveResult>;
  /** Base path for WeekView nav links; date appended as `?date=...`. */
  weekHrefBase?: string;
  weekHrefSuffix?: string;
};

export function WeekScheduler({
  kind,
  cursor,
  events,
  rows,
  assignees,
  lockedVolunteerId,
  assigneeLabel,
  saveAction,
  deleteAction,
  weekHrefBase,
  weekHrefSuffix,
}: WeekSchedulerProps) {
  const cursorDate = typeof cursor === 'string' ? new Date(cursor) : cursor;
  const [modal, setModal] = useState<ScheduleModalState>({ open: false });

  // Coerce ISO strings (we may receive them after the server-component
  // boundary) back into Date for the child components.
  const evs: WeekEvent[] = useMemo(
    () => events.map(e => ({
      ...e,
      startsAt: typeof e.startsAt === 'string' ? new Date(e.startsAt) : e.startsAt,
      endsAt:   typeof e.endsAt === 'string'   ? new Date(e.endsAt)   : e.endsAt,
    })),
    [events],
  );

  const openCreate = (startsAt: Date, endsAt: Date) => {
    setModal({
      open: true,
      startsAt, endsAt,
      rrule: null,
      notes: null,
      volunteerId: lockedVolunteerId ?? null,
      role: null,
      status: 'scheduled',
    });
  };

  const openEdit = (occurrenceId: string) => {
    const sourceId = occurrenceId.includes('__') ? occurrenceId.split('__')[0] : occurrenceId;
    const row = rows.find(r => r.id === sourceId);
    if (!row) return;
    setModal({
      open: true,
      id: row.id,
      startsAt: typeof row.startsAt === 'string' ? new Date(row.startsAt) : row.startsAt,
      endsAt:   typeof row.endsAt === 'string'   ? new Date(row.endsAt)   : row.endsAt,
      rrule: row.rrule,
      notes: row.notes,
      volunteerId: row.volunteerId,
      role: row.role ?? null,
      status: row.status ?? 'scheduled',
      isRecurringInstance: occurrenceId !== sourceId,
    });
  };

  return (
    <>
      <WeekView
        cursor={cursorDate}
        events={evs}
        onCreate={openCreate}
        onEdit={openEdit}
        weekHrefBase={weekHrefBase}
        weekHrefSuffix={weekHrefSuffix}
      />
      <ScheduleBlockModal
        kind={kind}
        assignees={assignees}
        assigneeLabel={assigneeLabel}
        lockedVolunteerId={lockedVolunteerId}
        state={modal}
        onClose={() => setModal({ open: false })}
        onSubmit={async (fd, _override) => saveAction(fd)}
        onDelete={deleteAction ? async (id) => { await deleteAction(id); } : undefined}
      />
    </>
  );
}
