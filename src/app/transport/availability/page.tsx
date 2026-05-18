import Link from 'next/link';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { WeekScheduler } from '@/components/calendar/WeekScheduler';
import { expandRange } from '@/lib/scheduling';
import { saveTransportAvailability, deleteTransportAvailability } from './actions';

export const dynamic = 'force-dynamic';

export default async function TransportAvailabilityPage({
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

  const [drivers, rows] = await Promise.all([
    prisma.transportVolunteer.findMany({ orderBy: { name: 'asc' } }),
    prisma.transportAvailability.findMany({
      where: {
        ...(driverFilter ? { volunteerId: driverFilter } : {}),
        OR: [
          // one-off block overlapping the week
          { rrule: null, startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
          // any recurring template (we'll filter by expansion below)
          { rrule: { not: null } },
        ],
      },
      include: { volunteer: { select: { id: true, name: true } } },
    }),
  ]);

  // Expand to occurrences across the visible week.
  const occs = expandRange(
    rows.map(r => ({ id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, rrule: r.rrule })),
    weekStart, weekEnd,
  );
  const rowsById = new Map(rows.map(r => [r.id, r]));

  const events = occs.map(o => {
    const row = rowsById.get(o.sourceId)!;
    return {
      occurrenceId: o.occurrenceId,
      sourceId: o.sourceId,
      startsAt: o.occurrenceStartsAt,
      endsAt: o.occurrenceEndsAt,
      variant: 'availability' as const,
      isRecurringInstance: o.isRecurringInstance,
      title: row.volunteer?.name ?? 'Unassigned',
      subtitle: row.notes ?? undefined,
    };
  });

  const schedulerRows = rows.map(r => ({
    id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, rrule: r.rrule,
    notes: r.notes, volunteerId: r.volunteerId,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/transport" className="text-sm text-teal-700 hover:underline">← Transport</Link>
          <H1>Driver availability</H1>
        </div>
        <div className="flex gap-2">
          <Btn href="/transport/shifts" variant="ghost">Shifts →</Btn>
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
            <Link href={`/transport/availability?date=${format(cursor, 'yyyy-MM-dd')}`}
              className="text-xs text-gray-500 hover:underline self-center">Clear</Link>
          )}
        </form>

        <WeekScheduler
          kind="availability"
          assigneeLabel="Driver"
          cursor={cursor}
          events={events}
          rows={schedulerRows}
          assignees={drivers.map(d => ({ id: d.id, name: d.name }))}
          saveAction={saveTransportAvailability}
          deleteAction={deleteTransportAvailability}
          weekHref={(d) => `/transport/availability?date=${format(d, 'yyyy-MM-dd')}${driverFilter ? `&driver=${driverFilter}` : ''}`}
        />
      </Card>
    </div>
  );
}
