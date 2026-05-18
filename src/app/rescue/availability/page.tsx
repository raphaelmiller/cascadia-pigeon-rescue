import Link from 'next/link';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { WeekScheduler } from '@/components/calendar/WeekScheduler';
import { expandRange } from '@/lib/scheduling';
import { saveRescueAvailability, deleteRescueAvailability } from './actions';

export const dynamic = 'force-dynamic';

export default async function RescueAvailabilityPage({
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

  const [rescuers, rows] = await Promise.all([
    prisma.rescueVolunteer.findMany({ orderBy: { name: 'asc' } }),
    prisma.rescueAvailability.findMany({
      where: {
        ...(rescuerFilter ? { volunteerId: rescuerFilter } : {}),
        OR: [
          { rrule: null, startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
          { rrule: { not: null } },
        ],
      },
      include: { volunteer: { select: { id: true, name: true } } },
    }),
  ]);

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
          <Link href="/rescue" className="text-sm text-teal-700 hover:underline">← Rescue</Link>
          <H1>Rescuer availability</H1>
        </div>
        <div className="flex gap-2">
          <Btn href="/rescue/shifts" variant="ghost">Shifts →</Btn>
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
            <Link href={`/rescue/availability?date=${format(cursor, 'yyyy-MM-dd')}`}
              className="text-xs text-gray-500 hover:underline self-center">Clear</Link>
          )}
        </form>

        <WeekScheduler
          kind="availability"
          assigneeLabel="Rescuer"
          cursor={cursor}
          events={events}
          rows={schedulerRows}
          assignees={rescuers.map(r => ({ id: r.id, name: r.name }))}
          saveAction={saveRescueAvailability}
          deleteAction={deleteRescueAvailability}
          weekHrefBase="/rescue/availability"
          weekHrefSuffix={rescuerFilter ? `rescuer=${rescuerFilter}` : undefined}
        />
      </Card>
    </div>
  );
}
