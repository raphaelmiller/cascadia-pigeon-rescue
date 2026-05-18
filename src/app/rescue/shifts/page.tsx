import Link from 'next/link';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { WeekScheduler } from '@/components/calendar/WeekScheduler';
import { expandRange, detectConflicts } from '@/lib/scheduling';
import { saveRescueShift, deleteRescueShift } from './actions';

export const dynamic = 'force-dynamic';

export default async function RescueShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; rescuer?: string }>;
}) {
  await requireOperator();
  const params = await searchParams;
  const cursor = params.date ? new Date(params.date + 'T12:00:00') : new Date();
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
  const rescuerFilter = params.rescuer || '';

  const [rescuers, shifts, availRows] = await Promise.all([
    prisma.rescueVolunteer.findMany({ orderBy: { name: 'asc' } }),
    prisma.rescueShift.findMany({
      where: {
        ...(rescuerFilter ? { volunteerId: rescuerFilter } : {}),
        OR: [
          { rrule: null, startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
          { rrule: { not: null } },
        ],
      },
      include: { volunteer: { select: { id: true, name: true } } },
    }),
    prisma.rescueAvailability.findMany({
      where: rescuerFilter ? { volunteerId: rescuerFilter } : {},
      select: { id: true, volunteerId: true, startsAt: true, endsAt: true, rrule: true },
    }),
  ]);

  const occs = expandRange(
    shifts.map(s => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, rrule: s.rrule })),
    weekStart, weekEnd,
  );
  const shiftsById = new Map(shifts.map(s => [s.id, s]));

  const availByRescuer = new Map<string, typeof availRows>();
  for (const a of availRows) {
    if (!a.volunteerId) continue;
    if (!availByRescuer.has(a.volunteerId)) availByRescuer.set(a.volunteerId, []);
    availByRescuer.get(a.volunteerId)!.push(a);
  }
  const shiftsByRescuer = new Map<string, typeof shifts>();
  for (const s of shifts) {
    if (!s.volunteerId) continue;
    if (!shiftsByRescuer.has(s.volunteerId)) shiftsByRescuer.set(s.volunteerId, []);
    shiftsByRescuer.get(s.volunteerId)!.push(s);
  }
  const occConflicts = new Map<string, boolean>();
  for (const o of occs) {
    const shift = shiftsById.get(o.sourceId)!;
    if (!shift.volunteerId || shift.status === 'cancelled') {
      occConflicts.set(o.occurrenceId, false); continue;
    }
    const ws = detectConflicts({
      shiftStartsAt: o.occurrenceStartsAt,
      shiftEndsAt: o.occurrenceEndsAt,
      shiftRrule: null,
      occurrencesToCheck: 1,
      assigneeName: shift.volunteer?.name ?? '?',
      availabilities: (availByRescuer.get(shift.volunteerId) ?? []).map(a => ({
        id: a.id, startsAt: a.startsAt, endsAt: a.endsAt, rrule: a.rrule,
      })),
      otherShifts: (shiftsByRescuer.get(shift.volunteerId) ?? [])
        .filter(s => s.id !== shift.id && s.status !== 'cancelled')
        .map(s => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, rrule: s.rrule, role: s.role })),
    });
    occConflicts.set(o.occurrenceId, ws.length > 0);
  }

  const events = occs.map(o => {
    const shift = shiftsById.get(o.sourceId)!;
    return {
      occurrenceId: o.occurrenceId,
      sourceId: o.sourceId,
      startsAt: o.occurrenceStartsAt,
      endsAt: o.occurrenceEndsAt,
      variant: 'shift' as const,
      isRecurringInstance: o.isRecurringInstance,
      hasConflict: occConflicts.get(o.occurrenceId) === true,
      title: shift.volunteer?.name ?? 'Unassigned',
      subtitle: [shift.role, shift.status === 'scheduled' ? null : shift.status?.replace('_', ' ')]
        .filter(Boolean).join(' · ') || undefined,
    };
  });

  const schedulerRows = shifts.map(s => ({
    id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, rrule: s.rrule, notes: s.notes,
    volunteerId: s.volunteerId, role: s.role, status: s.status,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/rescue" className="text-sm text-teal-700 hover:underline">← Rescue</Link>
          <H1>Rescue shifts</H1>
        </div>
        <div className="flex gap-2">
          <Btn href="/rescue/availability" variant="ghost">Availability →</Btn>
        </div>
      </div>

      <Card>
        <form method="get" className="flex items-end gap-2 flex-wrap mb-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Filter by rescuer</span>
            <select name="rescuer" defaultValue={rescuerFilter}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="">All rescuers</option>
              {rescuers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <input type="hidden" name="date" value={format(cursor, 'yyyy-MM-dd')} />
          <button type="submit" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">Apply</button>
          {rescuerFilter && (
            <Link href={`/rescue/shifts?date=${format(cursor, 'yyyy-MM-dd')}`}
              className="text-xs text-gray-500 hover:underline self-center">Clear</Link>
          )}
        </form>

        <WeekScheduler
          kind="shift"
          assigneeLabel="Rescuer"
          cursor={cursor}
          events={events}
          rows={schedulerRows}
          assignees={rescuers.map(r => ({ id: r.id, name: r.name }))}
          saveAction={saveRescueShift}
          deleteAction={deleteRescueShift}
          weekHref={(d) => `/rescue/shifts?date=${format(d, 'yyyy-MM-dd')}${rescuerFilter ? `&rescuer=${rescuerFilter}` : ''}`}
        />
      </Card>
    </div>
  );
}
