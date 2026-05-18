import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, addMonths, subMonths,
  addDays, subDays, addWeeks, subWeeks,
} from 'date-fns';
import { H1, H2, Card, Btn, Empty, Field, inputClass, Pill } from '@/components/ui';
import { fmtDateTime, daysUntil, isOverdue, computeRunout } from '@/lib/utils';
import { effectivePickupTime, requestTitle, summarizeRoute } from '@/lib/transportDisplay';
import {
  CALENDAR_TYPES, TRANSPORT_STATUS_TONE, URGENCY_TONE, SHIFT_TYPE_TONE,
} from '@/lib/constants';
import { activeBirdWhere } from '@/lib/filters';
import { CalendarDatePopover } from '@/components/CalendarDatePopover';
import { CalendarTabs, type CalTab } from '@/components/CalendarTabs';
import { CalendarViewSwitcher, type CalView } from '@/components/CalendarViewSwitcher';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// =====================================================================
// Unified Calendar — three tabs (All / Transport / Rescue)
//                    three views (Day / Week / Month)
// =====================================================================

const TYPE_TONE: Record<string, string> = {
  vet: 'blue', bandage: 'orange', med_start: 'green', med_stop: 'gray',
  med_reassess: 'yellow', refill: 'red', supply: 'purple', transfer: 'orange',
  adoption: 'green', followup: 'blue',
};

const TYPE_DOT: Record<string, string> = {
  vet: 'bg-sky-500', bandage: 'bg-orange-500', med_start: 'bg-emerald-500',
  med_stop: 'bg-gray-400', med_reassess: 'bg-yellow-400', refill: 'bg-red-500',
  supply: 'bg-violet-500', transfer: 'bg-orange-500', adoption: 'bg-emerald-500',
  followup: 'bg-sky-500',
};

const TRANSPORT_STATUS_DOT: Record<string, string> = {
  open: 'bg-orange-500', assigned: 'bg-yellow-400', in_transit: 'bg-sky-500',
  delivered: 'bg-emerald-500', cancelled: 'bg-gray-400',
};

const SHIFT_TYPE_DOT: Record<string, string> = {
  on_call: 'bg-sky-500', active: 'bg-emerald-500', emergency_backup: 'bg-orange-500',
};

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

async function createEvent(formData: FormData) {
  'use server';
  await requireOperator();
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
  const ym = format(ev.startsAt, 'yyyy-MM');
  const dy = format(ev.startsAt, 'yyyy-MM-dd');
  redirect(`/calendar?tab=all&month=${ym}&day=${dy}`);
}

async function toggleDone(id: string, done: boolean) {
  'use server';
  await requireOperator();
  const ev = await prisma.calendarEvent.update({ where: { id }, data: { done } });
  const ym = format(ev.startsAt, 'yyyy-MM');
  const dy = format(ev.startsAt, 'yyyy-MM-dd');
  redirect(`/calendar?tab=all&month=${ym}&day=${dy}`);
}

// ---------------------------------------------------------------------
// Range resolution — given (view, day, month), produce the visible window.
// ---------------------------------------------------------------------
function resolveRange(view: CalView, selectedDay: Date, monthCursor: Date) {
  if (view === 'day') {
    const start = new Date(selectedDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { rangeStart: start, rangeEnd: end, gridDays: [start] };
  }
  if (view === 'week') {
    const ws = startOfWeek(selectedDay, { weekStartsOn: 0 });
    const we = endOfWeek(selectedDay, { weekStartsOn: 0 });
    return {
      rangeStart: ws,
      rangeEnd: we,
      gridDays: eachDayOfInterval({ start: ws, end: we }),
    };
  }
  // month
  const ms = startOfMonth(monthCursor);
  const me = endOfMonth(monthCursor);
  const gs = startOfWeek(ms, { weekStartsOn: 0 });
  const ge = endOfWeek(me, { weekStartsOn: 0 });
  return {
    rangeStart: gs,
    rangeEnd: ge,
    gridDays: eachDayOfInterval({ start: gs, end: ge }),
  };
}

function rangeLabel(view: CalView, selectedDay: Date, monthCursor: Date) {
  if (view === 'day') return format(selectedDay, 'EEEE, MMMM d, yyyy');
  if (view === 'week') {
    const ws = startOfWeek(selectedDay, { weekStartsOn: 0 });
    const we = endOfWeek(selectedDay, { weekStartsOn: 0 });
    if (ws.getMonth() === we.getMonth()) {
      return `${format(ws, 'MMM d')} – ${format(we, 'd, yyyy')}`;
    }
    return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
  }
  return format(monthCursor, 'MMMM yyyy');
}

// Step navigation: change-by-1 prev/next based on view.
function navHrefs(view: CalView, tab: CalTab, selectedDay: Date, monthCursor: Date) {
  const tabQ = tab;
  const viewQ = view;
  if (view === 'day') {
    const prev = subDays(selectedDay, 1);
    const next = addDays(selectedDay, 1);
    return {
      prev: `/calendar?tab=${tabQ}&view=${viewQ}&month=${format(prev, 'yyyy-MM')}&day=${format(prev, 'yyyy-MM-dd')}`,
      next: `/calendar?tab=${tabQ}&view=${viewQ}&month=${format(next, 'yyyy-MM')}&day=${format(next, 'yyyy-MM-dd')}`,
    };
  }
  if (view === 'week') {
    const prev = subWeeks(selectedDay, 1);
    const next = addWeeks(selectedDay, 1);
    return {
      prev: `/calendar?tab=${tabQ}&view=${viewQ}&month=${format(prev, 'yyyy-MM')}&day=${format(prev, 'yyyy-MM-dd')}`,
      next: `/calendar?tab=${tabQ}&view=${viewQ}&month=${format(next, 'yyyy-MM')}&day=${format(next, 'yyyy-MM-dd')}`,
    };
  }
  const prev = subMonths(monthCursor, 1);
  const next = addMonths(monthCursor, 1);
  return {
    prev: `/calendar?tab=${tabQ}&view=${viewQ}&month=${format(prev, 'yyyy-MM')}&day=${format(selectedDay, 'yyyy-MM-dd')}`,
    next: `/calendar?tab=${tabQ}&view=${viewQ}&month=${format(next, 'yyyy-MM')}&day=${format(selectedDay, 'yyyy-MM-dd')}`,
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; tab?: string; view?: string }>;
}) {
  const params = await searchParams;
  const tab: CalTab = (['all', 'transport', 'rescue'].includes(params.tab || '')
    ? params.tab
    : 'all') as CalTab;
  const view: CalView = (['day', 'week', 'month'].includes(params.view || '')
    ? params.view
    : 'month') as CalView;

  const today = new Date();
  let monthCursor = today;
  if (params.month) {
    const [y, m] = params.month.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) monthCursor = new Date(y, m - 1, 1);
  }
  const selectedKey = params.day || format(today, 'yyyy-MM-dd');
  const selectedDate = new Date(selectedKey + 'T12:00:00');
  const monthKey = format(monthCursor, 'yyyy-MM');

  const { rangeStart, rangeEnd, gridDays } = resolveRange(view, selectedDate, monthCursor);
  const { prev, next } = navHrefs(view, tab, selectedDate, monthCursor);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <H1>Calendar</H1>
        <div className="flex items-center gap-2 flex-wrap">
          <Btn href={prev} variant="ghost">←</Btn>
          <CalendarDatePopover
            basePath="/calendar"
            monthCursor={monthKey}
            selectedDay={selectedKey}
            extraParams={{ tab, view }}
          />
          <Btn href={next} variant="ghost">→</Btn>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CalendarTabs active={tab} monthCursor={monthKey} selectedDay={selectedKey} view={view} />
        <CalendarViewSwitcher active={view} tab={tab} monthCursor={monthKey} selectedDay={selectedKey} />
      </div>

      {tab === 'all' && (
        <AllEventsView
          view={view}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          gridDays={gridDays}
          monthCursor={monthCursor}
          selectedKey={selectedKey}
          selectedDate={selectedDate}
        />
      )}

      {tab === 'transport' && (
        <TransportView
          view={view}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          gridDays={gridDays}
          monthCursor={monthCursor}
          selectedKey={selectedKey}
          selectedDate={selectedDate}
        />
      )}

      {tab === 'rescue' && (
        <RescueView
          view={view}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          gridDays={gridDays}
          monthCursor={monthCursor}
          selectedKey={selectedKey}
          selectedDate={selectedDate}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// View: All events
// ---------------------------------------------------------------------
async function AllEventsView({
  view, rangeStart, rangeEnd, gridDays, monthCursor, selectedKey, selectedDate,
}: ViewProps) {
  const today = new Date();
  const [events, bandages, meds, birds] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: rangeStart, lte: rangeEnd } },
      include: { bird: true },
    }),
    prisma.bandageTask.findMany({
      where: {
        active: true,
        nextDueAt: { gte: rangeStart, lte: rangeEnd },
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

  const all: SyntheticEvent[] = [];
  for (const e of events) {
    all.push({
      id: e.id, source: 'event', startsAt: e.startsAt, title: e.title, type: e.type,
      birdId: e.birdId, birdName: e.bird?.name ?? null, notes: e.notes, done: e.done,
    });
  }
  for (const t of bandages) {
    all.push({
      id: 'b_' + t.id, source: 'bandage', startsAt: t.nextDueAt,
      title: `Bandage: ${t.description}`, type: 'bandage',
      birdId: t.birdId, birdName: t.bird.name, notes: t.notes, done: false,
    });
  }
  for (const m of meds) {
    const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
    if (runout && runout >= rangeStart && runout <= rangeEnd) {
      all.push({
        id: 'r_' + m.id, source: 'med_runout', startsAt: runout,
        title: `${m.name} runout — ${m.bird.name}`, type: 'refill',
        birdId: m.birdId, birdName: m.bird.name, notes: 'Refill due', done: m.refillDelivered,
      });
    }
    if (m.reassessDate && m.reassessDate >= rangeStart && m.reassessDate <= rangeEnd) {
      all.push({
        id: 'a_' + m.id, source: 'med_reassess', startsAt: m.reassessDate,
        title: `Reassess ${m.name} — ${m.bird.name}`, type: 'med_reassess',
        birdId: m.birdId, birdName: m.bird.name, notes: null, done: false,
      });
    }
  }

  const byDay = groupByDay(all, e => e.startsAt);
  const selectedEvents = byDay.get(selectedKey) || [];

  return (
    <>
      <Card>
        <RangeHeader
          view={view}
          monthCursor={monthCursor}
          selectedDate={selectedDate}
          summary={`${all.length} item${all.length !== 1 ? 's' : ''} ${rangeNoun(view)}`}
        />

        {view === 'month' && (
          <MonthGrid
            days={gridDays}
            cursor={monthCursor}
            selectedKey={selectedKey}
            tab="all"
            view={view}
            byDay={byDay}
            renderItem={e => (
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
            )}
          />
        )}

        {view === 'week' && (
          <WeekGrid
            days={gridDays}
            selectedKey={selectedKey}
            tab="all"
            view={view}
            monthCursor={monthCursor}
            byDay={byDay}
            renderItem={e => (
              <div
                key={e.id}
                className={`text-[11px] leading-snug rounded px-1.5 py-1 truncate ${
                  e.type === 'refill' ? 'bg-red-50 text-red-800'
                  : e.type === 'bandage' ? 'bg-orange-50 text-orange-800'
                  : e.type === 'med_reassess' ? 'bg-yellow-50 text-yellow-800'
                  : e.type === 'vet' || e.type === 'followup' ? 'bg-sky-50 text-sky-800'
                  : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                <div className="font-medium truncate">{e.title}</div>
                <div className="text-[10px] opacity-70">{format(e.startsAt, 'h:mm a')}</div>
              </div>
            )}
          />
        )}

        {view === 'day' && (
          <DayList
            items={selectedEvents}
            empty="Nothing on this day."
            renderItem={e => {
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
                    <form action={async () => { 'use server'; await requireOperator(); await toggleDone(e.id, !e.done); }}>
                      <Btn type="submit" variant={e.done ? 'ghost' : 'primary'}>
                        {e.done ? 'Reopen' : 'Done ✓'}
                      </Btn>
                    </form>
                  )}
                </li>
              );
            }}
          />
        )}
      </Card>

      {view !== 'day' && (
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
                      <form action={async () => { 'use server'; await requireOperator(); await toggleDone(e.id, !e.done); }}>
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
      )}

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
          💡 Synthetic items: <span className="text-orange-700">bandage tasks</span>, <span className="text-red-700">medication runouts</span>, and <span className="text-yellow-700">reassessment dates</span> auto-flow from their source.
        </p>
      </Card>

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
    </>
  );
}

// ---------------------------------------------------------------------
// View: Transport
// ---------------------------------------------------------------------
async function TransportView({
  view, rangeStart, rangeEnd, gridDays, monthCursor, selectedKey, selectedDate,
}: ViewProps) {
  // PR C: Two queries. Legacy rows (pickupBy set, no stops) come back
  // from the first query and render as a single block per request, same
  // as before. New multi-stop rows (pickupBy null, stops != []) come
  // back from the second query and we synthesize one calendar item per
  // TransportStop. Both shapes coexist on the same byDay map.
  const [legacyTransports, stopRows] = await Promise.all([
    prisma.transportRequest.findMany({
      where: { pickupBy: { gte: rangeStart, lte: rangeEnd } },
      include: { volunteer: true },
      orderBy: { pickupBy: 'asc' },
    }),
    prisma.transportStop.findMany({
      where: { timeStart: { gte: rangeStart, lte: rangeEnd } },
      include: { request: { include: { volunteer: true } } },
      orderBy: { timeStart: 'asc' },
    }),
  ]);

  // Render-shape: every calendar item is a TransportItem with a `when`
  // Date (non-null). Legacy = 1 per request; new = 1 per stop.
  type TransportItem = {
    id: string;            // requestId or requestId#stopId
    requestId: string;
    when: Date;
    kind: 'legacy' | 'pickup' | 'dropoff';
    location: string | null;
    title: string;         // request title or route summary
    routeSummary: string;  // "A → B" for legacy, "📍 Vet on 12th" for stop
    request: typeof legacyTransports[number];
  };
  const items: TransportItem[] = [];
  for (const t of legacyTransports) {
    if (!t.pickupBy) continue; // shouldn't happen for legacy rows, but type-safe
    items.push({
      id: t.id,
      requestId: t.id,
      when: t.pickupBy,
      kind: 'legacy',
      location: null,
      title: requestTitle(t),
      routeSummary: summarizeRoute(t, 18),
      request: t,
    });
  }
  for (const s of stopRows) {
    if (!s.timeStart) continue;
    const icon = s.kind === 'pickup' ? '📍' : '🏁';
    const where = s.location ?? '(location TBD)';
    items.push({
      id: `${s.requestId}#${s.id}`,
      requestId: s.requestId,
      when: s.timeStart,
      kind: s.kind === 'dropoff' ? 'dropoff' : 'pickup',
      location: s.location,
      title: requestTitle(s.request),
      routeSummary: `${icon} ${where.slice(0, 18)}`,
      request: s.request as typeof legacyTransports[number],
    });
  }
  items.sort((a, b) => a.when.getTime() - b.when.getTime());
  const byDay = groupByDay(items, (it) => it.when);
  const selectedItems = byDay.get(selectedKey) || [];

  const allActive = await prisma.transportRequest.findMany({
    where: { status: { in: ['open', 'assigned', 'in_transit'] } },
    include: { volunteer: true, stops: true },
    orderBy: { createdAt: 'asc' },
  });
  const unassigned = allActive.filter(t => !t.volunteerId);
  const pending = allActive.filter(t => t.status === 'open');
  const inTransit = allActive.filter(t => t.status === 'in_transit');
  const next7 = allActive.filter(t => {
    const when = effectivePickupTime(t);
    if (!when) return false;
    return (daysUntil(when) ?? 99) <= 7;
  });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile tone={pending.length ? 'orange' : 'green'} label="Pending"     value={pending.length}    href="/calendar/focus/transport/pending" />
        <SummaryTile tone={unassigned.length ? 'red' : 'green'} label="Unassigned"  value={unassigned.length} href="/calendar/focus/transport/unassigned" />
        <SummaryTile tone={inTransit.length ? 'blue' : 'gray'} label="In transit"  value={inTransit.length}  href="/calendar/focus/transport/in_transit" />
        <SummaryTile tone={next7.length ? 'yellow' : 'green'} label="Next 7 days"  value={next7.length}      href="/calendar/focus/transport/next7" />
      </div>

      <Card>
        <RangeHeader
          view={view}
          monthCursor={monthCursor}
          selectedDate={selectedDate}
          summary={`${items.length} transport${items.length !== 1 ? 's' : ''} ${rangeNoun(view)}`}
        />

        {view === 'month' && (
          <MonthGrid
            days={gridDays}
            cursor={monthCursor}
            selectedKey={selectedKey}
            tab="transport"
            view={view}
            byDay={byDay}
            renderItem={(it) => {
              const r = it.request;
              const tone = !r.volunteerId
                ? 'bg-red-50 text-red-800'
                : r.status === 'in_transit'
                ? 'bg-sky-50 text-sky-800'
                : r.status === 'delivered'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-yellow-50 text-yellow-800';
              // PR C: stop-tone overlay so pickups/dropoffs are visually
              // distinct from legacy rows in dense month/week grids.
              const stopTone = it.kind === 'pickup' ? 'border-l-2 border-blue-400'
                : it.kind === 'dropoff' ? 'border-l-2 border-green-500'
                : '';
              return (
                <div key={it.id} className={`flex items-center gap-1 text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${tone} ${stopTone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${TRANSPORT_STATUS_DOT[r.status] || 'bg-gray-400'}`} />
                  <span className="truncate">{it.routeSummary}</span>
                </div>
              );
            }}
          />
        )}

        {view === 'week' && (
          <WeekGrid
            days={gridDays}
            selectedKey={selectedKey}
            tab="transport"
            view={view}
            monthCursor={monthCursor}
            byDay={byDay}
            renderItem={(it) => {
              const r = it.request;
              const tone = !r.volunteerId ? 'bg-red-50 text-red-800'
                : r.status === 'in_transit' ? 'bg-sky-50 text-sky-800'
                : r.status === 'delivered' ? 'bg-emerald-50 text-emerald-800'
                : 'bg-yellow-50 text-yellow-800';
              const stopTone = it.kind === 'pickup' ? 'border-l-2 border-blue-400'
                : it.kind === 'dropoff' ? 'border-l-2 border-green-500'
                : '';
              return (
                <div key={it.id} className={`text-[11px] leading-snug rounded px-1.5 py-1 truncate ${tone} ${stopTone}`}>
                  <div className="font-medium truncate">{it.routeSummary}</div>
                  <div className="text-[10px] opacity-70">{format(it.when, 'h:mm a')}{r.volunteer ? ` · ${r.volunteer.name.split(' ')[0]}` : ' · UNASSIGNED'}</div>
                </div>
              );
            }}
          />
        )}

        {view === 'day' && (
          <DayList
            items={selectedItems}
            empty="No transports scheduled for this day."
            renderItem={(it) => {
              const r = it.request;
              const overdue = !['delivered', 'cancelled'].includes(r.status) && isOverdue(it.when);
              return (
                <li key={it.id} className="py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={URGENCY_TONE[r.urgency] || 'gray'}>{r.urgency}</Pill>
                    <Pill tone={TRANSPORT_STATUS_TONE[r.status] || 'gray'}>{r.status.replace('_', ' ')}</Pill>
                    {it.kind === 'pickup' && <Pill tone="blue">pickup</Pill>}
                    {it.kind === 'dropoff' && <Pill tone="green">drop-off</Pill>}
                    {!r.volunteerId && <Pill tone="red">UNASSIGNED</Pill>}
                    {overdue && <Pill tone="red">overdue</Pill>}
                    <span className="text-xs text-gray-500 ml-auto">{fmtDateTime(it.when)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>{it.title}</strong>
                    {it.kind !== 'legacy' && it.location && <> · {it.location}</>}
                    {it.kind === 'legacy' && <> · {summarizeRoute(r, 32)}</>}
                  </div>
                  {r.description && <p className="text-sm text-gray-600 mt-0.5">{r.description}</p>}
                  {r.volunteer && <p className="text-xs text-gray-500 mt-0.5">Driver: <strong>{r.volunteer.name}</strong>{r.volunteer.phone ? ` · ${r.volunteer.phone}` : ''}</p>}
                  <div className="mt-1"><Link href={`/transport/requests/${it.requestId}`} className="text-xs text-teal-700 hover:underline">Open transport →</Link></div>
                </li>
              );
            }}
          />
        )}
      </Card>

      {view !== 'day' && (
        <Card tone={selectedItems.length ? 'blue' : 'gray'}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <H2>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</H2>
            <span className="text-xs text-gray-500">{selectedItems.length} transport{selectedItems.length !== 1 ? 's' : ''}</span>
          </div>
          {selectedItems.length === 0 ? <Empty msg="No transports scheduled for this day." /> : (
            <ul className="divide-y divide-gray-100">
              {selectedItems.map((it) => {
                const r = it.request;
                const overdue = !['delivered', 'cancelled'].includes(r.status) && isOverdue(it.when);
                return (
                  <li key={it.id} className="py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={URGENCY_TONE[r.urgency] || 'gray'}>{r.urgency}</Pill>
                      <Pill tone={TRANSPORT_STATUS_TONE[r.status] || 'gray'}>{r.status.replace('_', ' ')}</Pill>
                      {it.kind === 'pickup' && <Pill tone="blue">pickup</Pill>}
                      {it.kind === 'dropoff' && <Pill tone="green">drop-off</Pill>}
                      {!r.volunteerId && <Pill tone="red">UNASSIGNED</Pill>}
                      {overdue && <Pill tone="red">overdue</Pill>}
                      <span className="text-xs text-gray-500 ml-auto">{fmtDateTime(it.when)}</span>
                    </div>
                    <div className="mt-1 text-sm">
                      <strong>{it.title}</strong>
                      {it.kind !== 'legacy' && it.location && <> · {it.location}</>}
                      {it.kind === 'legacy' && <> · {summarizeRoute(r, 32)}</>}
                    </div>
                    {r.description && <p className="text-sm text-gray-600 mt-0.5">{r.description}</p>}
                    {r.volunteer && <p className="text-xs text-gray-500 mt-0.5">Driver: <strong>{r.volunteer.name}</strong>{r.volunteer.phone ? ` · ${r.volunteer.phone}` : ''}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3">
            <Btn href="/transport" variant="ghost">→ Manage transports</Btn>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// View: Rescue
// ---------------------------------------------------------------------
async function RescueView({
  view, rangeStart, rangeEnd, gridDays, monthCursor, selectedKey, selectedDate,
}: ViewProps) {
  const today = new Date();
  const shifts = await prisma.rescueShift.findMany({
    where: { startsAt: { lte: rangeEnd }, endsAt: { gte: rangeStart } },
    include: { volunteer: true },
    orderBy: { startsAt: 'asc' },
  });
  const byDay = groupByDay(shifts, s => s.startsAt);
  const selectedShifts = byDay.get(selectedKey) || [];

  const next14 = await prisma.rescueShift.findMany({
    where: { startsAt: { lte: new Date(today.getTime() + 14 * 86400000) }, endsAt: { gte: today } },
    include: { volunteer: true },
    orderBy: { startsAt: 'asc' },
  });
  const onCall = next14.filter(s => s.shiftType === 'on_call');
  const active = next14.filter(s => s.shiftType === 'active');
  const backup = next14.filter(s => s.shiftType === 'emergency_backup');
  const open = next14.filter(s => !s.volunteerId);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile tone="blue"   label="On-call (14d)"     value={onCall.length}  href="/calendar/focus/rescue/on_call" />
        <SummaryTile tone="green"  label="Active (14d)"      value={active.length}  href="/calendar/focus/rescue/active" />
        <SummaryTile tone="orange" label="Emergency backup"  value={backup.length}  href="/calendar/focus/rescue/backup" />
        <SummaryTile tone={open.length ? 'red' : 'green'} label="Open shifts" value={open.length} href="/calendar/focus/rescue/open" />
      </div>

      <Card>
        <RangeHeader
          view={view}
          monthCursor={monthCursor}
          selectedDate={selectedDate}
          summary={`${shifts.length} shift${shifts.length !== 1 ? 's' : ''} ${rangeNoun(view)}`}
        />

        {view === 'month' && (
          <MonthGrid
            days={gridDays}
            cursor={monthCursor}
            selectedKey={selectedKey}
            tab="rescue"
            view={view}
            byDay={byDay}
            renderItem={s => {
              const tone = !s.volunteerId ? 'bg-red-50 text-red-800'
                : s.shiftType === 'emergency_backup' ? 'bg-orange-50 text-orange-800'
                : s.shiftType === 'active' ? 'bg-emerald-50 text-emerald-800'
                : 'bg-sky-50 text-sky-800';
              return (
                <div key={s.id} className={`flex items-center gap-1 text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${tone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${SHIFT_TYPE_DOT[s.shiftType] || 'bg-gray-400'}`} />
                  <span className="truncate">
                    {s.volunteer?.name ?? 'OPEN'}
                    {s.area ? ` · ${s.area}` : ''}
                  </span>
                </div>
              );
            }}
          />
        )}

        {view === 'week' && (
          <WeekGrid
            days={gridDays}
            selectedKey={selectedKey}
            tab="rescue"
            view={view}
            monthCursor={monthCursor}
            byDay={byDay}
            renderItem={s => {
              const tone = !s.volunteerId ? 'bg-red-50 text-red-800'
                : s.shiftType === 'emergency_backup' ? 'bg-orange-50 text-orange-800'
                : s.shiftType === 'active' ? 'bg-emerald-50 text-emerald-800'
                : 'bg-sky-50 text-sky-800';
              return (
                <div key={s.id} className={`text-[11px] leading-snug rounded px-1.5 py-1 truncate ${tone}`}>
                  <div className="font-medium truncate">{s.volunteer?.name ?? 'OPEN'}</div>
                  <div className="text-[10px] opacity-70">{format(s.startsAt, 'h:mm a')} · {s.shiftType.replace('_', ' ')}</div>
                </div>
              );
            }}
          />
        )}

        {view === 'day' && (
          <DayList
            items={selectedShifts}
            empty="No shifts scheduled for this day."
            renderItem={s => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill tone={SHIFT_TYPE_TONE[s.shiftType] || 'gray'}>{s.shiftType.replace('_', ' ')}</Pill>
                  {!s.volunteerId && <Pill tone="red">OPEN</Pill>}
                  <span className="text-xs text-gray-500 ml-auto">{fmtDateTime(s.startsAt)} → {fmtDateTime(s.endsAt)}</span>
                </div>
                <div className="text-sm mt-1">
                  {s.volunteer ? <><strong>{s.volunteer.name}</strong>{s.volunteer.phone ? ` · ${s.volunteer.phone}` : ''}</> : <span className="text-orange-700">UNASSIGNED — needs cover</span>}
                </div>
                {s.area && <div className="text-xs text-gray-600">📍 {s.area}</div>}
                {s.notes && <div className="text-xs text-gray-600 mt-0.5">{s.notes}</div>}
              </li>
            )}
          />
        )}
      </Card>

      {view !== 'day' && (
        <Card tone={selectedShifts.length ? 'blue' : 'gray'}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <H2>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</H2>
            <span className="text-xs text-gray-500">{selectedShifts.length} shift{selectedShifts.length !== 1 ? 's' : ''}</span>
          </div>
          {selectedShifts.length === 0 ? <Empty msg="No shifts scheduled for this day." /> : (
            <ul className="divide-y divide-gray-100">
              {selectedShifts.map(s => (
                <li key={s.id} className="py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={SHIFT_TYPE_TONE[s.shiftType] || 'gray'}>{s.shiftType.replace('_', ' ')}</Pill>
                    {!s.volunteerId && <Pill tone="red">OPEN</Pill>}
                    <span className="text-xs text-gray-500 ml-auto">{fmtDateTime(s.startsAt)} → {fmtDateTime(s.endsAt)}</span>
                  </div>
                  <div className="text-sm mt-1">
                    {s.volunteer ? <><strong>{s.volunteer.name}</strong>{s.volunteer.phone ? ` · ${s.volunteer.phone}` : ''}</> : <span className="text-orange-700">UNASSIGNED — needs cover</span>}
                  </div>
                  {s.area && <div className="text-xs text-gray-600">📍 {s.area}</div>}
                  {s.notes && <div className="text-xs text-gray-600 mt-0.5">{s.notes}</div>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Btn href="/rescue" variant="ghost">→ Manage shifts</Btn>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------
type ViewProps = {
  view: CalView;
  rangeStart: Date;
  rangeEnd: Date;
  gridDays: Date[];
  monthCursor: Date;
  selectedKey: string;
  selectedDate: Date;
};

function rangeNoun(view: CalView) {
  return view === 'day' ? 'today' : view === 'week' ? 'this week' : 'this month';
}

function groupByDay<T>(items: T[], getDate: (t: T) => Date): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = format(getDate(it), 'yyyy-MM-dd');
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  for (const [, list] of m) list.sort((a, b) => getDate(a).getTime() - getDate(b).getTime());
  return m;
}

function RangeHeader({
  view, monthCursor, selectedDate, summary,
}: { view: CalView; monthCursor: Date; selectedDate: Date; summary: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xl font-semibold">{rangeLabel(view, selectedDate, monthCursor)}</h2>
      <span className="text-xs text-gray-500">{summary}</span>
    </div>
  );
}

function MonthGrid<T>({
  days, cursor, selectedKey, tab, view, byDay, renderItem,
}: {
  days: Date[];
  cursor: Date;
  selectedKey: string;
  tab: CalTab;
  view: CalView;
  byDay: Map<string, T[]>;
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <>
      <WeekHeader />
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-b-lg overflow-hidden">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const items = byDay.get(key) || [];
          return (
            <DayCell key={key} day={day} cursor={cursor} selectedKey={selectedKey} count={items.length} tab={tab} view={view}>
              {items.slice(0, 3).map(renderItem)}
              {items.length > 3 && <div className="text-[10px] text-gray-500 px-1">+{items.length - 3} more</div>}
            </DayCell>
          );
        })}
      </div>
    </>
  );
}

function WeekGrid<T>({
  days, selectedKey, tab, view, monthCursor, byDay, renderItem,
}: {
  days: Date[];
  selectedKey: string;
  tab: CalTab;
  view: CalView;
  monthCursor: Date;
  byDay: Map<string, T[]>;
  renderItem: (item: T) => React.ReactNode;
}) {
  const monthKey = format(monthCursor, 'yyyy-MM');
  return (
    <>
      <WeekHeader />
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-b-lg overflow-hidden">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const items = byDay.get(key) || [];
          const isSelected = key === selectedKey;
          const today_ = isToday(day);
          return (
            <Link
              key={key}
              href={`/calendar?tab=${tab}&view=${view}&month=${monthKey}&day=${key}`}
              className={`bg-white min-h-48 p-2 flex flex-col gap-1 transition ${
                isSelected ? 'ring-2 ring-teal-500 ring-inset' : 'hover:bg-teal-50/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{format(day, 'EEE')}</span>
                  <span
                    className={`inline-flex items-center justify-center text-sm font-semibold ${
                      today_ ? 'h-7 w-7 rounded-full bg-teal-600 text-white' : 'text-gray-700'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                </div>
                {items.length > 0 && <span className="text-[10px] text-gray-400">{items.length}</span>}
              </div>
              <div className="space-y-1 overflow-hidden flex-1">
                {items.map(renderItem)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function DayList<T>({
  items, renderItem, empty,
}: { items: T[]; renderItem: (i: T) => React.ReactNode; empty: string }) {
  if (items.length === 0) return <Empty msg={empty} />;
  return (
    <ul className="divide-y divide-gray-100">
      {items.map(renderItem)}
    </ul>
  );
}

function WeekHeader() {
  return (
    <div className="grid grid-cols-7 gap-px bg-gray-100 text-xs font-semibold text-gray-500 rounded-t-lg overflow-hidden">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="bg-white px-2 py-1.5 text-center">{d}</div>
      ))}
    </div>
  );
}

function DayCell({
  day, cursor, selectedKey, count, children, tab, view,
}: {
  day: Date;
  cursor: Date;
  selectedKey: string;
  count: number;
  children: React.ReactNode;
  tab: CalTab;
  view: CalView;
}) {
  const key = format(day, 'yyyy-MM-dd');
  const inMonth = isSameMonth(day, cursor);
  const today_ = isToday(day);
  const isSelected = key === selectedKey;
  const monthKey = format(cursor, 'yyyy-MM');
  return (
    <Link
      href={`/calendar?tab=${tab}&view=${view}&month=${monthKey}&day=${key}`}
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
        {count > 0 && <span className="text-[10px] text-gray-400">{count}</span>}
      </div>
      <div className="space-y-0.5 overflow-hidden">{children}</div>
    </Link>
  );
}

function SummaryTile({
  label, value, tone, href,
}: {
  label: string;
  value: number;
  tone: string;
  href?: string;
}) {
  const inner = (
    <Card
      tone={tone}
      className={`h-full transition ${href ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
    >
      <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-gray-600 uppercase tracking-wide mt-1 flex items-center gap-1">
        <span>{label}</span>
        {href && <span className="opacity-50 ml-auto">›</span>}
      </div>
    </Card>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}
