import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, addMonths, subMonths,
} from 'date-fns';
import { H1, H2, Card, Btn, Empty, Field, inputClass, Pill } from '@/components/ui';
import { fmtDate, fmtDateTime, daysUntil, isOverdue, computeRunout } from '@/lib/utils';
import { CALENDAR_TYPES } from '@/lib/constants';
import { activeBirdWhere } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const TYPE_TONE: Record<string, string> = {
  vet: 'blue',
  bandage: 'orange',
  med_start: 'green',
  med_stop: 'gray',
  med_reassess: 'yellow',
  refill: 'red',
  supply: 'purple',
  transfer: 'orange',
  adoption: 'green',
  followup: 'blue',
};

const TYPE_DOT: Record<string, string> = {
  vet: 'bg-sky-500',
  bandage: 'bg-orange-500',
  med_start: 'bg-emerald-500',
  med_stop: 'bg-gray-400',
  med_reassess: 'bg-yellow-400',
  refill: 'bg-red-500',
  supply: 'bg-violet-500',
  transfer: 'bg-orange-500',
  adoption: 'bg-emerald-500',
  followup: 'bg-sky-500',
};

async function createEvent(formData: FormData) {
  'use server';
  const startsAt = String(formData.get('startsAt') || '');
  if (!startsAt) return;
  const ev = await prisma.calendarEvent.create({
    data: {
      title: String(formData.get('title') || '').trim() || 'Event',
      type: String(formData.get('type') || 'followup'),
      startsAt: new Date(startsAt),
      birdId: String(formData.get('birdId') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  // Redirect back to the same month view
  const ym = format(ev.startsAt, 'yyyy-MM');
  redirect(`/calendar?month=${ym}`);
}

async function toggleDone(id: string, done: boolean) {
  'use server';
  const ev = await prisma.calendarEvent.update({ where: { id }, data: { done } });
  const ym = format(ev.startsAt, 'yyyy-MM');
  redirect(`/calendar?month=${ym}`);
}

type SyntheticEvent = {
  id: string;
  source: 'event' | 'bandage' | 'med_runout' | 'med_reassess';
  startsAt: Date;
  title: string;
  type: string;
  birdId: string | null;
  birdName: string | null;
  notes: string | null;
  done: boolean;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const params = await searchParams;
  // Resolve month
  const today = new Date();
  let cursor = today;
  if (params.month) {
    const [y, m] = params.month.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) {
      cursor = new Date(y, m - 1, 1);
    }
  }
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const prevMonth = format(subMonths(cursor, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(cursor, 1), 'yyyy-MM');

  // Pull a wide window so prev/next month previews still work (just for the rendered grid).
  const [events, bandages, meds, birds] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: gridStart, lte: gridEnd } },
      include: { bird: true },
    }),
    prisma.bandageTask.findMany({
      where: {
        active: true,
        nextDueAt: { gte: gridStart, lte: gridEnd },
        bird: activeBirdWhere,
      },
      include: { bird: true },
    }),
    prisma.medication.findMany({
      include: { bird: true },
      where: {
        OR: [{ stopDate: null }, { stopDate: { gt: today } }],
        bird: activeBirdWhere,
      },
    }),
    prisma.bird.findMany({ where: activeBirdWhere, orderBy: { name: 'asc' } }),
  ]);

  // Compose synthetic event list for the month.
  const all: SyntheticEvent[] = [];

  for (const e of events) {
    all.push({
      id: e.id,
      source: 'event',
      startsAt: e.startsAt,
      title: e.title,
      type: e.type,
      birdId: e.birdId,
      birdName: e.bird?.name ?? null,
      notes: e.notes,
      done: e.done,
    });
  }
  for (const t of bandages) {
    all.push({
      id: 'b_' + t.id,
      source: 'bandage',
      startsAt: t.nextDueAt,
      title: `Bandage: ${t.description}`,
      type: 'bandage',
      birdId: t.birdId,
      birdName: t.bird.name,
      notes: t.notes,
      done: false,
    });
  }
  for (const m of meds) {
    const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
    if (runout && runout >= gridStart && runout <= gridEnd) {
      all.push({
        id: 'r_' + m.id,
        source: 'med_runout',
        startsAt: runout,
        title: `${m.name} runout — ${m.bird.name}`,
        type: 'refill',
        birdId: m.birdId,
        birdName: m.bird.name,
        notes: 'Refill due',
        done: m.refillDelivered,
      });
    }
    if (m.reassessDate && m.reassessDate >= gridStart && m.reassessDate <= gridEnd) {
      all.push({
        id: 'a_' + m.id,
        source: 'med_reassess',
        startsAt: m.reassessDate,
        title: `Reassess ${m.name} — ${m.bird.name}`,
        type: 'med_reassess',
        birdId: m.birdId,
        birdName: m.bird.name,
        notes: null,
        done: false,
      });
    }
  }

  // Group by yyyy-mm-dd
  const byDay = new Map<string, SyntheticEvent[]>();
  for (const e of all) {
    const key = format(e.startsAt, 'yyyy-MM-dd');
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }
  for (const [, list] of byDay) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // Selected day events
  const selectedKey = params.day || format(today, 'yyyy-MM-dd');
  const selectedDate = new Date(selectedKey + 'T12:00:00');
  const selectedEvents = byDay.get(selectedKey) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <H1>Calendar</H1>
        <div className="flex items-center gap-2">
          <Btn href={`/calendar?month=${prevMonth}`} variant="ghost">←</Btn>
          <Btn href={`/calendar?month=${format(today, 'yyyy-MM')}`} variant="ghost">Today</Btn>
          <Btn href={`/calendar?month=${nextMonth}`} variant="ghost">→</Btn>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">{format(cursor, 'MMMM yyyy')}</h2>
          <span className="text-xs text-gray-500">{all.length} item{all.length !== 1 ? 's' : ''} this month</span>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 text-xs font-semibold text-gray-500 rounded-t-lg overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-white px-2 py-1.5 text-center">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-b-lg overflow-hidden">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const inMonth = isSameMonth(day, cursor);
            const today_ = isToday(day);
            const items = byDay.get(key) || [];
            const isSelected = key === selectedKey;
            return (
              <Link
                key={key}
                href={`/calendar?month=${format(cursor, 'yyyy-MM')}&day=${key}`}
                className={`bg-white min-h-20 md:min-h-28 p-1.5 flex flex-col gap-0.5 transition ${
                  inMonth ? '' : 'bg-gray-50 text-gray-400'
                } ${isSelected ? 'ring-2 ring-teal-500 ring-inset' : 'hover:bg-teal-50/40'}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold ${
                      today_ ? 'h-6 w-6 rounded-full bg-teal-600 text-white' : 'text-gray-700'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[10px] text-gray-400">{items.length}</span>
                  )}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {items.slice(0, 3).map(e => (
                    <div
                      key={e.id}
                      className={`flex items-center gap-1 text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${
                        e.done ? 'opacity-50 line-through' : ''
                      } ${
                        e.type === 'refill' || (e.source === 'event' && isOverdue(e.startsAt) && !e.done)
                          ? 'bg-red-50 text-red-800'
                          : e.type === 'bandage' || e.type === 'transfer'
                          ? 'bg-orange-50 text-orange-800'
                          : e.type === 'med_reassess'
                          ? 'bg-yellow-50 text-yellow-800'
                          : e.type === 'vet' || e.type === 'followup'
                          ? 'bg-sky-50 text-sky-800'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${TYPE_DOT[e.type] || 'bg-gray-400'}`} />
                      <span className="truncate">{e.title}</span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] text-gray-500 px-1">+{items.length - 3} more</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Selected day details */}
      <Card tone={selectedEvents.length ? 'blue' : 'gray'}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <H2>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</H2>
          <span className="text-xs text-gray-500">{selectedEvents.length} item{selectedEvents.length !== 1 ? 's' : ''}</span>
        </div>
        {selectedEvents.length === 0 ? <Empty msg="Nothing on this day." /> : (
          <ul className="divide-y divide-gray-100">
            {selectedEvents.map(e => {
              const overdue = !e.done && isOverdue(e.startsAt);
              return (
                <li key={e.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                  <Pill tone={overdue ? 'red' : TYPE_TONE[e.type] || 'gray'}>{e.type.replace('_', ' ')}</Pill>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-gray-500">
                      {fmtDateTime(e.startsAt)}
                      {e.birdId && (
                        <>
                          {' · '}
                          <Link href={`/birds/${e.birdId}`} className="text-teal-700 hover:underline">{e.birdName}</Link>
                        </>
                      )}
                      {e.notes ? ` · ${e.notes}` : ''}
                      {e.source !== 'event' && ` · auto from ${e.source.replace('_', ' ')}`}
                    </div>
                  </div>
                  {e.source === 'event' && (
                    <form action={async () => { 'use server'; await toggleDone(e.id, !e.done); }}>
                      <Btn type="submit" variant={e.done ? 'ghost' : 'primary'}>
                        {e.done ? 'Reopen' : 'Done ✓'}
                      </Btn>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Add event */}
      <Card>
        <H2>Add event</H2>
        <form action={createEvent} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Title *">
            <input required name="title" className={inputClass} />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue="vet" className={inputClass}>
              {CALENDAR_TYPES.map(t => (<option key={t} value={t}>{t.replace('_', ' ')}</option>))}
            </select>
          </Field>
          <Field label="When *">
            <input required type="datetime-local" name="startsAt" defaultValue={`${selectedKey}T09:00`} className={inputClass} />
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
        <p className="text-xs text-gray-500 mt-2">
          💡 The calendar also shows synthetic items: <span className="text-orange-700">bandage tasks</span>, <span className="text-red-700">medication runouts</span>, and <span className="text-yellow-700">reassessment dates</span>. Those auto-flow from their source — manage them on those pages.
        </p>
      </Card>

      {/* Legend */}
      <Card>
        <H2>Legend</H2>
        <div className="mt-3 flex gap-2 flex-wrap text-xs">
          {Object.entries(TYPE_DOT).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-50 ring-1 ring-gray-200">
              <span className={`h-2 w-2 rounded-full ${c}`} />
              {k.replace('_', ' ')}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
