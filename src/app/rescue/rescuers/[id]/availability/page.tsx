import Link from 'next/link';
import { notFound } from 'next/navigation';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card } from '@/components/ui';
import { WeekScheduler } from '@/components/calendar/WeekScheduler';
import { expandRange } from '@/lib/scheduling';
import { saveRescueAvailability, deleteRescueAvailability } from '@/app/rescue/availability/actions';

export const dynamic = 'force-dynamic';

export default async function RescuerAvailabilityPage({
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

  const rescuer = await prisma.rescueVolunteer.findUnique({ where: { id } });
  if (!rescuer) notFound();

  const rows = await prisma.rescueAvailability.findMany({
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
      title: rescuer.name,
      subtitle: row.notes ?? undefined,
    };
  });

  const schedulerRows = rows.map(r => ({
    id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, rrule: r.rrule,
    notes: r.notes, volunteerId: r.volunteerId,
  }));

  return (
    <div className="space-y-4">
      <Link href="/rescue" className="text-sm text-teal-700 hover:underline">← Rescue</Link>
      <H1>{rescuer.name} · availability</H1>

      <Card>
        <WeekScheduler
          kind="availability"
          assigneeLabel="Rescuer"
          cursor={cursor}
          events={events}
          rows={schedulerRows}
          assignees={[{ id: rescuer.id, name: rescuer.name }]}
          lockedVolunteerId={rescuer.id}
          saveAction={saveRescueAvailability}
          deleteAction={deleteRescueAvailability}
          weekHref={(d) => `/rescue/rescuers/${id}/availability?date=${format(d, 'yyyy-MM-dd')}`}
        />
      </Card>
    </div>
  );
}
