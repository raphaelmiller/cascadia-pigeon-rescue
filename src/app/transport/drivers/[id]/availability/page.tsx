import Link from 'next/link';
import { notFound } from 'next/navigation';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card } from '@/components/ui';
import { WeekScheduler } from '@/components/calendar/WeekScheduler';
import { expandRange } from '@/lib/scheduling';
import { saveTransportAvailability, deleteTransportAvailability } from '@/app/transport/availability/actions';

export const dynamic = 'force-dynamic';

export default async function DriverAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  await requireOperator();
  const { id } = await params;
  const sp = await searchParams;
  const cursor = sp.date ? new Date(sp.date + 'T12:00:00') : new Date();
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });

  const driver = await prisma.transportVolunteer.findUnique({ where: { id } });
  if (!driver) notFound();

  const rows = await prisma.transportAvailability.findMany({
    where: {
      volunteerId: id,
      OR: [
        { rrule: null, startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
        { rrule: { not: null } },
      ],
    },
  });

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
      title: driver.name,
      subtitle: row.notes ?? undefined,
    };
  });

  const schedulerRows = rows.map(r => ({
    id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, rrule: r.rrule,
    notes: r.notes, volunteerId: r.volunteerId,
  }));

  return (
    <div className="space-y-4">
      <Link href={`/transport/drivers/${id}`} className="text-sm text-teal-700 hover:underline">← {driver.name}</Link>
      <H1>{driver.name} · availability</H1>

      <Card>
        <WeekScheduler
          kind="availability"
          assigneeLabel="Driver"
          cursor={cursor}
          events={events}
          rows={schedulerRows}
          assignees={[{ id: driver.id, name: driver.name }]}
          lockedVolunteerId={driver.id}
          saveAction={saveTransportAvailability}
          deleteAction={deleteTransportAvailability}
          weekHrefBase={`/transport/drivers/${id}/availability`}
        />
      </Card>
    </div>
  );
}
