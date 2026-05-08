import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Btn, Empty, Field, inputClass, Pill } from '@/components/ui';
import { fmtDate, fmtDateTime, daysUntil, isOverdue } from '@/lib/utils';
import { CALENDAR_TYPES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createEvent(formData: FormData) {
  'use server';
  const startsAt = String(formData.get('startsAt') || '');
  if (!startsAt) return;
  await prisma.calendarEvent.create({
    data: {
      title: String(formData.get('title') || '').trim() || 'Event',
      type: String(formData.get('type') || 'followup'),
      startsAt: new Date(startsAt),
      birdId: String(formData.get('birdId') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect('/calendar');
}

async function toggleDone(id: string, done: boolean) {
  'use server';
  await prisma.calendarEvent.update({ where: { id }, data: { done } });
  redirect('/calendar');
}

export default async function CalendarPage() {
  const [events, birds] = await Promise.all([
    prisma.calendarEvent.findMany({
      orderBy: { startsAt: 'asc' },
      include: { bird: true },
    }),
    prisma.bird.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const now = new Date();
  const overdue = events.filter(e => !e.done && e.startsAt < now);
  const next48h = events.filter(e => !e.done && e.startsAt >= now && (daysUntil(e.startsAt) ?? 99) <= 2);
  const upcoming = events.filter(e => !e.done && e.startsAt >= now && (daysUntil(e.startsAt) ?? 99) > 2);
  const done = events.filter(e => e.done);

  return (
    <div className="space-y-4">
      <H1>Calendar</H1>

      <Card>
        <H2>Add event</H2>
        <form action={createEvent} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Title *">
            <input required name="title" className={inputClass} />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue="vet" className={inputClass}>
              {CALENDAR_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
            </select>
          </Field>
          <Field label="When *">
            <input required type="datetime-local" name="startsAt" className={inputClass} />
          </Field>
          <Field label="Bird">
            <select name="birdId" defaultValue="" className={inputClass}>
              <option value="">— none —</option>
              {birds.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={2} className={inputClass} />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add event</Btn></div>
        </form>
      </Card>

      {overdue.length > 0 && (
        <Card tone="red">
          <H2>Overdue</H2>
          <EventList events={overdue} />
        </Card>
      )}

      <Card tone={next48h.length ? 'orange' : 'gray'}>
        <H2>Next 48 hours</H2>
        {next48h.length === 0 ? <Empty msg="Nothing in the next 48 hours." /> : <EventList events={next48h} />}
      </Card>

      <Card tone="blue">
        <H2>Upcoming</H2>
        {upcoming.length === 0 ? <Empty msg="No further events scheduled." /> : <EventList events={upcoming} />}
      </Card>

      {done.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold text-gray-700">Completed ({done.length})</summary>
            <ul className="divide-y divide-gray-100 mt-3">
              {done.slice(0, 30).map(e => (
                <li key={e.id} className="py-2 text-sm text-gray-500 line-through">
                  {fmtDate(e.startsAt)} · {e.title} · {e.type}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}

function EventList({ events }: { events: Awaited<ReturnType<typeof prisma.calendarEvent.findMany>> }) {
  return (
    <ul className="divide-y divide-gray-100 mt-3">
      {events.map((e: any) => {
        const overdue = !e.done && isOverdue(e.startsAt);
        return (
          <li key={e.id} className="py-2.5 flex items-center gap-3 flex-wrap">
            <Pill tone={overdue ? 'red' : 'blue'}>{e.type}</Pill>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-gray-500">
                {fmtDateTime(e.startsAt)}
                {e.bird && <> · <Link href={`/birds/${e.bird.id}`} className="text-teal-700 hover:underline">{e.bird.name}</Link></>}
                {e.notes ? ` · ${e.notes}` : ''}
              </div>
            </div>
            <form action={async () => { 'use server'; await prisma.calendarEvent.update({ where: { id: e.id }, data: { done: !e.done } }); }}>
              <Btn type="submit" variant={e.done ? 'ghost' : 'primary'}>
                {e.done ? 'Reopen' : 'Done'}
              </Btn>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
