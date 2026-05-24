import Link from 'next/link';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn, Pill } from '@/components/ui';
import { WeekScheduler } from '@/components/calendar/WeekScheduler';
import { expandRange, detectConflicts } from '@/lib/scheduling';
import { saveTransportShift, deleteTransportShift } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  scheduled: 'blue',
  in_progress: 'yellow',
  completed: 'green',
  cancelled: 'gray',
  no_show: 'red',
};

export default async function TransportShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; driver?: string }>;
}) {
  await requireOperator();
  const params = await searchParams;
  const cursor = params.date ? new Date(params.date + 'T12:00:00') : new Date();
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
  const driverFilter = params.driver || '';

  const [drivers, shifts, availRows] = await Promise.all([
    prisma.transportVolunteer.findMany({ orderBy: { name: 'asc' } }),
    prisma.transportShift.findMany({
      where: {
        ...(driverFilter ? { volunteerId: driverFilter } : {}),
        OR: [
          { rrule: null, startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
          { rrule: { not: null } },
        ],
      },
      include: { volunteer: { select: { id: true, name: true } } },
    }),
    prisma.transportAvailability.findMany({
      where: driverFilter ? { volunteerId: driverFilter } : {},
      select: { id: true, volunteerId: true, startsAt: true, endsAt: true, rrule: true },
    }),
  ]);

  const occs = expandRange(
    shifts.map(s => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, rrule: s.rrule })),
    weekStart, weekEnd,
  );
  const shiftsById = new Map(shifts.map(s => [s.id, s]));

  // Compute conflicts for each occurrence shown — purely visual (red ring).
  // The save-time check runs server-side; this surfaces previously-saved
  // conflicts (override=true) so Christina can spot them at a glance.
  const availByDriver = new Map<string, typeof availRows>();
  for (const a of availRows) {
    if (!a.volunteerId) continue;
    if (!availByDriver.has(a.volunteerId)) availByDriver.set(a.volunteerId, []);
    availByDriver.get(a.volunteerId)!.push(a);
  }
  const shiftsByDriver = new Map<string, typeof shifts>();
  for (const s of shifts) {
    if (!s.volunteerId) continue;
    if (!shiftsByDriver.has(s.volunteerId)) shiftsByDriver.set(s.volunteerId, []);
    shiftsByDriver.get(s.volunteerId)!.push(s);
  }

  const occConflicts = new Map<string, boolean>();
  for (const o of occs) {
    const shift = shiftsById.get(o.sourceId)!;
    if (!shift.volunteerId || shift.status === 'cancelled') {
      occConflicts.set(o.occurrenceId, false);
      continue;
    }
    const ws = detectConflicts({
      shiftStartsAt: o.occurrenceStartsAt,
      shiftEndsAt: o.occurrenceEndsAt,
      shiftRrule: null,
      occurrencesToCheck: 1,
      assigneeName: shift.volunteer?.name ?? '?',
      availabilities: (availByDriver.get(shift.volunteerId) ?? []).map(a => ({
        id: a.id, startsAt: a.startsAt, endsAt: a.endsAt, rrule: a.rrule,
      })),
      otherShifts: (shiftsByDriver.get(shift.volunteerId) ?? [])
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

  // KPIs for the header banner.
  const allUpcoming = await prisma.transportShift.findMany({
    where: { endsAt: { gte: new Date() }, status: { notIn: ['cancelled', 'completed'] } },
    select: { id: true, volunteerId: true, status: true },
  });
  const unassigned = allUpcoming.filter(s => !s.volunteerId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/transport" className="text-sm text-teal-700 hover:underline">← Transport</Link>
          <H1>Transport shifts</H1>
          <p className="text-sm text-gray-600 mt-1">
            {allUpcoming.length} upcoming · {unassigned} unassigned
          </p>
        </div>
        <div className="flex gap-2">
          <Btn href="/transport/availability" variant="ghost">Availability →</Btn>
        </div>
      </div>

      <Card>
        <form method="get" className="flex items-end gap-2 flex-wrap mb-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Filter by driver</span>
            <select name="driver" defaultValue={driverFilter}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="">All drivers</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <input type="hidden" name="date" value={format(cursor, 'yyyy-MM-dd')} />
          <button type="submit" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">Apply</button>
          {driverFilter && (
            <Link href={`/transport/shifts?date=${format(cursor, 'yyyy-MM-dd')}`}
              className="text-xs text-gray-500 hover:underline self-center">Clear</Link>
          )}
        </form>

        <WeekScheduler
          kind="shift"
          assigneeLabel="Driver"
          cursor={cursor}
          events={events}
          rows={schedulerRows}
          assignees={drivers.map(d => ({ id: d.id, name: d.name }))}
          saveAction={saveTransportShift}
          deleteAction={deleteTransportShift}
          weekHrefBase="/transport/shifts"
          weekHrefSuffix={driverFilter ? `driver=${driverFilter}` : undefined}
        />
      </Card>
    </div>
  );
}
