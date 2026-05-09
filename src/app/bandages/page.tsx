import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Pill, Btn, Empty, Field, inputClass, StatusDot } from '@/components/ui';
import { fmtDateTime, daysUntil } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function createTask(formData: FormData) {
  'use server';
  const birdId = String(formData.get('birdId') || '');
  const description = String(formData.get('description') || '').trim();
  const intervalDays = Number(formData.get('intervalDays') || 2);
  const nextDueAt = String(formData.get('nextDueAt') || '');
  if (!birdId || !description || !nextDueAt) return;
  await prisma.bandageTask.create({
    data: {
      birdId,
      description,
      intervalDays,
      nextDueAt: new Date(nextDueAt),
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect('/bandages');
}

async function markDone(id: string) {
  'use server';
  const t = await prisma.bandageTask.findUnique({ where: { id } });
  if (!t) return;
  const next = new Date(Date.now() + t.intervalDays * 86400000);
  await prisma.bandageTask.update({
    where: { id },
    data: {
      lastDoneAt: new Date(),
      nextDueAt: next,
    },
  });
  redirect('/bandages');
}

async function deactivate(id: string) {
  'use server';
  await prisma.bandageTask.update({ where: { id }, data: { active: false } });
  redirect('/bandages');
}

export default async function BandagesPage() {
  const [tasks, birds] = await Promise.all([
    prisma.bandageTask.findMany({
      where: { active: true },
      include: { bird: true },
      orderBy: { nextDueAt: 'asc' },
    }),
    prisma.bird.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const overdue = tasks.filter(t => (daysUntil(t.nextDueAt) ?? 99) < 0);
  const today = tasks.filter(t => (daysUntil(t.nextDueAt) ?? 99) === 0);
  const next3 = tasks.filter(t => (daysUntil(t.nextDueAt) ?? 99) > 0 && (daysUntil(t.nextDueAt) ?? 99) <= 3);
  const upcoming = tasks.filter(t => (daysUntil(t.nextDueAt) ?? 99) > 3);

  return (
    <div className="space-y-4">
      <H1>Bandage tasks</H1>

      {overdue.length > 0 && (
        <Card tone="red">
          <H2>Overdue</H2>
          <BandageList tasks={overdue} markDone={markDone} deactivate={deactivate} />
        </Card>
      )}

      <Card tone={today.length ? 'orange' : 'gray'}>
        <H2>Due today</H2>
        {today.length === 0 ? <Empty msg="Nothing due today." /> : (
          <BandageList tasks={today} markDone={markDone} deactivate={deactivate} />
        )}
      </Card>

      <Card tone="yellow">
        <H2>Next 3 days</H2>
        {next3.length === 0 ? <Empty msg="Nothing in the next 3 days." /> : (
          <BandageList tasks={next3} markDone={markDone} deactivate={deactivate} />
        )}
      </Card>

      <Card tone="blue">
        <H2>Upcoming</H2>
        {upcoming.length === 0 ? <Empty msg="No further bandage tasks." /> : (
          <BandageList tasks={upcoming} markDone={markDone} deactivate={deactivate} />
        )}
      </Card>

      <Card>
        <H2>Add bandage task</H2>
        <form action={createTask} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Bird *">
            <select required name="birdId" defaultValue="" className={inputClass}>
              <option value="">— select —</option>
              {birds.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="Interval (days)"><input type="number" name="intervalDays" defaultValue={2} className={inputClass} /></Field>
          <Field label="First due *"><input required type="datetime-local" name="nextDueAt" className={inputClass} /></Field>
          <Field label="Description *" className="sm:col-span-2">
            <input required name="description" placeholder="Wing wrap change, vet wrap, gauze + tape…" className={inputClass} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={2} className={inputClass} />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add task</Btn></div>
        </form>
        <p className="text-xs text-gray-500 mt-2">Tasks auto-reschedule by their interval when marked done.</p>
      </Card>
    </div>
  );
}

function BandageList({
  tasks,
  markDone,
  deactivate,
}: {
  tasks: any[];
  markDone: (id: string) => Promise<void>;
  deactivate: (id: string) => Promise<void>;
}) {
  return (
    <ul className="divide-y divide-gray-100 mt-3">
      {tasks.map(t => {
        const days = daysUntil(t.nextDueAt) ?? 99;
        const tone = days < 0 ? 'red' : days === 0 ? 'orange' : days <= 3 ? 'yellow' : 'blue';
        return (
          <li key={t.id} className="py-2.5 flex items-center gap-3 flex-wrap">
            <StatusDot tone={tone} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {t.description} · <Link href={`/birds/${t.birdId}`} className="text-teal-700 hover:underline">{t.bird.name}</Link>
              </div>
              <div className="text-xs text-gray-500">
                Due {fmtDateTime(t.nextDueAt)} · every {t.intervalDays}d
                {t.lastDoneAt && ` · last done ${fmtDateTime(t.lastDoneAt)}`}
              </div>
            </div>
            <Pill tone={tone}>{days < 0 ? `${-days}d overdue` : days === 0 ? 'today' : `${days}d`}</Pill>
            <form action={async () => { 'use server'; await markDone(t.id); }}><Btn type="submit" variant="primary">Done ✓</Btn></form>
            <form action={async () => { 'use server'; await deactivate(t.id); }}><Btn type="submit" variant="ghost">End</Btn></form>
          </li>
        );
      })}
    </ul>
  );
}
