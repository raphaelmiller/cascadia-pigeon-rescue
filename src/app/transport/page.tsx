import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, isSameDay, addMonths, subMonths,
  addDays, subDays, addWeeks, subWeeks, startOfDay, endOfDay,
} from 'date-fns';
import { H1, H2, Card, Pill, Btn, Empty, Field, inputClass, StatusDot } from '@/components/ui';
import { fmtDateTime, fmtRelative, daysUntil, isOverdue } from '@/lib/utils';
import { URGENCY_TONE, REQUEST_URGENCIES, TRANSPORT_STATUS_TONE } from '@/lib/constants';
import { activeBirdWhere } from '@/lib/filters';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type ViewMode = 'day' | 'week' | 'month';

// ---------- Server actions ----------
async function createRequest(formData: FormData) {
  'use server';
  await requireOperator();
  const fromAddress = String(formData.get('fromAddress') || '').trim();
  const toAddress = String(formData.get('toAddress') || '').trim();
  const pickupBy = String(formData.get('pickupBy') || '');
  if (!fromAddress || !toAddress || !pickupBy) return;
  await prisma.transportRequest.create({
    data: {
      fromAddress,
      toAddress,
      pickupBy: new Date(pickupBy),
      deliverBy: formData.get('deliverBy') ? new Date(String(formData.get('deliverBy'))) : null,
      description: String(formData.get('description') || '') || null,
      urgency: String(formData.get('urgency') || 'normal'),
      birdId: String(formData.get('birdId') || '') || null,
      volunteerId: String(formData.get('volunteerId') || '') || null,
      status: formData.get('volunteerId') ? 'assigned' : 'open',
    },
  });
  redirect('/transport');
}

async function createVolunteer(formData: FormData) {
  'use server';
  await requireOperator();
  const linkedFosterId = String(formData.get('linkedFosterId') || '') || null;
  let baseData: Record<string, unknown> = {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '') || null,
    email: String(formData.get('email') || '') || null,
    location: String(formData.get('location') || '') || null,
  };
  if (linkedFosterId) {
    const f = await prisma.foster.findUnique({ where: { id: linkedFosterId } });
    if (f) baseData = { name: f.name, phone: f.phone, email: f.email, location: f.address };
  }
  if (!baseData.name) return;
  await prisma.transportVolunteer.create({
    data: {
      ...baseData,
      linkedFosterId,
      vehicleType: String(formData.get('vehicleType') || '') || null,
      maxDistanceMi: formData.get('maxDistanceMi') ? Number(formData.get('maxDistanceMi')) : null,
      // medicalCapable was removed from the new-driver form 2026-05-17.
      // The DB column is retained for historical data — new drivers get
      // the schema default (false); existing records keep their value.
      availability: String(formData.get('availability') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    } as Parameters<typeof prisma.transportVolunteer.create>[0]['data'],
  });
  redirect('/transport');
}

// ---------- Page ----------
export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === 'week' || params.view === 'month' ? params.view : 'day') as ViewMode;
  const today = new Date();
  let cursor = today;
  if (params.date) {
    const parsed = new Date(params.date + 'T12:00:00');
    if (!Number.isNaN(parsed.getTime())) cursor = parsed;
  }

  const { rangeStart, rangeEnd, prevHref, nextHref, todayHref, label } = computeRange(view, cursor);

  const [requests, volunteers, birds] = await Promise.all([
    prisma.transportRequest.findMany({
      where: { pickupBy: { gte: rangeStart, lte: rangeEnd } },
      include: { volunteer: true },
      orderBy: { pickupBy: 'asc' },
    }),
    prisma.transportVolunteer.findMany({
      include: {
        linkedFoster: true,
        _count: { select: { requests: { where: { status: { in: ['assigned', 'in_transit', 'open'] } } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.bird.findMany({ where: activeBirdWhere, orderBy: { name: 'asc' } }),
  ]);

  // Operational summary for the header KPIs (across all active, not just visible range).
  const allActive = await prisma.transportRequest.findMany({
    where: { status: { in: ['open', 'assigned', 'in_transit'] } },
    include: { volunteer: true },
    orderBy: { pickupBy: 'asc' },
  });
  const unassigned = allActive.filter(t => !t.volunteerId);
  const inTransit = allActive.filter(t => t.status === 'in_transit');
  const todays = allActive.filter(t => isSameDay(t.pickupBy, today));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Transport</H1>
          <p className="text-sm text-gray-600 mt-1">
            {allActive.length} active · {unassigned.length} unassigned · {inTransit.length} in transit · {todays.length} today
          </p>
        </div>
        <Btn href="/calendar?tab=transport" variant="ghost">Full calendar →</Btn>
      </div>

      {/* Today's coverage banner */}
      <Card tone={todays.filter(t => t.volunteerId).length === todays.length && todays.length > 0 ? 'green' : todays.length === 0 ? 'gray' : 'orange'}>
        <H2>Today's coverage</H2>
        {todays.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">No transports scheduled for today.</p>
        ) : (
          <ul className="divide-y divide-gray-100 mt-3">
            {todays.map(t => (
              <li key={t.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <Pill tone={TRANSPORT_STATUS_TONE[t.status] || 'gray'}>{t.status.replace('_', ' ')}</Pill>
                <Pill tone={URGENCY_TONE[t.urgency] || 'gray'}>{t.urgency}</Pill>
                <Link href={`/transport/requests/${t.id}`} className="text-sm font-medium hover:underline flex-1 truncate">
                  {t.fromAddress} → {t.toAddress}
                </Link>
                <span className="text-xs text-gray-500">{format(t.pickupBy, 'h:mm a')}</span>
                <span className="text-xs">
                  {t.volunteer ? (
                    <Link href={`/transport/drivers/${t.volunteer.id}`} className="font-semibold text-teal-700 hover:underline">
                      {t.volunteer.name}
                    </Link>
                  ) : (
                    <span className="text-orange-700 font-semibold">UNASSIGNED</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Add new job */}
      <Card tone="blue">
        <details open>
          <summary className="cursor-pointer text-base font-semibold text-gray-700 uppercase tracking-wide">
            + Add new transport job
          </summary>
          <form action={createRequest} className="grid gap-3 sm:grid-cols-2 mt-3">
            <Field label="From *"><input required name="fromAddress" placeholder="Pickup address / vet / foster" className={inputClass} /></Field>
            <Field label="To *"><input required name="toAddress" placeholder="Destination" className={inputClass} /></Field>
            <Field label="Pickup by *"><input required type="datetime-local" name="pickupBy" className={inputClass} /></Field>
            <Field label="Deliver by"><input type="datetime-local" name="deliverBy" className={inputClass} /></Field>
            <Field label="Bird">
              <select name="birdId" defaultValue="" className={inputClass}>
                <option value="">— none —</option>
                {birds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Urgency">
              <select name="urgency" defaultValue="normal" className={inputClass}>
                {REQUEST_URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Assign driver (optional)">
              <select name="volunteerId" defaultValue="" className={inputClass}>
                <option value="">— leave open —</option>
                {volunteers.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes / what's needed" className="sm:col-span-2">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
            <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add job</Btn></div>
          </form>
        </details>
      </Card>

      {/* View toggle + nav */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Btn href={prevHref} variant="ghost">←</Btn>
            <Btn href={todayHref} variant="ghost">Today</Btn>
            <Btn href={nextHref} variant="ghost">→</Btn>
            <span className="text-sm font-semibold ml-2">{label}</span>
          </div>
          <div className="inline-flex rounded-lg ring-1 ring-gray-200 bg-gray-50 p-0.5">
            <ViewLink view="day" current={view} dateISO={format(cursor, 'yyyy-MM-dd')}>Day</ViewLink>
            <ViewLink view="week" current={view} dateISO={format(cursor, 'yyyy-MM-dd')}>Week</ViewLink>
            <ViewLink view="month" current={view} dateISO={format(cursor, 'yyyy-MM-dd')}>Month</ViewLink>
          </div>
        </div>

        <div className="mt-4">
          {view === 'day' && <DayView cursor={cursor} requests={requests} />}
          {view === 'week' && <WeekView cursor={cursor} requests={requests} />}
          {view === 'month' && <MonthView cursor={cursor} requests={requests} />}
        </div>
      </Card>

      {/* Drivers panel */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <H2>Drivers ({volunteers.length})</H2>
          <span className="text-xs text-gray-500">Click a name to edit profile</span>
        </div>
        {volunteers.length === 0 ? <Empty msg="No drivers yet — add one below." /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {volunteers.map(v => (
              <Link key={v.id} href={`/transport/drivers/${v.id}`} className="block">
                <div className="rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-teal-300 transition cursor-pointer">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">{v.name}</div>
                    {v.linkedFoster && <Pill tone="purple">also a foster</Pill>}
                    {/* 🩺 medical pill removed 2026-05-17; column retained for legacy data. */}
                    {v._count.requests > 0 && (
                      <Pill tone={v._count.requests >= 3 ? 'orange' : 'green'}>{v._count.requests} active</Pill>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {v.location || 'location ?'} · {v.vehicleType || 'vehicle ?'}
                    {v.maxDistanceMi != null && ` · ≤${v.maxDistanceMi}mi`}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {v.phone || 'no phone'}
                    {v.email && ` · ${v.email}`}
                  </div>
                  {v.availability && <div className="text-xs text-gray-500 mt-0.5">avail: {v.availability}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-teal-700">+ Add driver</summary>
          <form action={createVolunteer} className="grid gap-3 sm:grid-cols-2 mt-3">
            <Field label="Or link to existing foster" className="sm:col-span-2">
              <select name="linkedFosterId" defaultValue="" className={inputClass}>
                <option value="">— new person —</option>
                {/* eligibleFosters re-uses page-level fosters when none */}
              </select>
            </Field>
            <Field label="Name (if not linking)"><input name="name" className={inputClass} /></Field>
            <Field label="Phone"><input name="phone" className={inputClass} /></Field>
            <Field label="Email"><input type="email" name="email" className={inputClass} /></Field>
            <Field label="Location"><input name="location" className={inputClass} /></Field>
            <Field label="Vehicle"><input name="vehicleType" placeholder="sedan / SUV / van" className={inputClass} /></Field>
            <Field label="Max distance (mi)"><input type="number" name="maxDistanceMi" className={inputClass} /></Field>
            <Field label="Availability" className="sm:col-span-2">
              <input name="availability" placeholder="weekends / evenings / on-call" className={inputClass} />
            </Field>
            {/*
              "Comfortable transporting medical birds" checkbox + 🩺 pill
              both removed 2026-05-17. The underlying `medicalCapable`
              column is retained in the schema so historical data is
              preserved; new drivers default to false. UI no longer
              surfaces this field.
            */}
            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
            <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add driver</Btn></div>
          </form>
        </details>
      </Card>
    </div>
  );
}

// ---------- View helpers ----------
function computeRange(view: ViewMode, cursor: Date) {
  if (view === 'day') {
    const start = startOfDay(cursor);
    const end = endOfDay(cursor);
    return {
      rangeStart: start,
      rangeEnd: end,
      prevHref: `/transport?view=day&date=${format(subDays(cursor, 1), 'yyyy-MM-dd')}`,
      nextHref: `/transport?view=day&date=${format(addDays(cursor, 1), 'yyyy-MM-dd')}`,
      todayHref: `/transport?view=day&date=${format(new Date(), 'yyyy-MM-dd')}`,
      label: format(cursor, 'EEEE, MMMM d, yyyy'),
    };
  }
  if (view === 'week') {
    const start = startOfWeek(cursor, { weekStartsOn: 0 });
    const end = endOfWeek(cursor, { weekStartsOn: 0 });
    return {
      rangeStart: start,
      rangeEnd: end,
      prevHref: `/transport?view=week&date=${format(subWeeks(cursor, 1), 'yyyy-MM-dd')}`,
      nextHref: `/transport?view=week&date=${format(addWeeks(cursor, 1), 'yyyy-MM-dd')}`,
      todayHref: `/transport?view=week&date=${format(new Date(), 'yyyy-MM-dd')}`,
      label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
    };
  }
  // month
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const start = startOfWeek(monthStart, { weekStartsOn: 0 });
  const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return {
    rangeStart: start,
    rangeEnd: end,
    prevHref: `/transport?view=month&date=${format(subMonths(cursor, 1), 'yyyy-MM-dd')}`,
    nextHref: `/transport?view=month&date=${format(addMonths(cursor, 1), 'yyyy-MM-dd')}`,
    todayHref: `/transport?view=month&date=${format(new Date(), 'yyyy-MM-dd')}`,
    label: format(cursor, 'MMMM yyyy'),
  };
}

function ViewLink({ view, current, dateISO, children }: { view: ViewMode; current: ViewMode; dateISO: string; children: React.ReactNode }) {
  const active = view === current;
  return (
    <Link
      href={`/transport?view=${view}&date=${dateISO}`}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
        active ? 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </Link>
  );
}

// ---------- DAY VIEW (hour timeline) ----------
function DayView({ cursor, requests }: { cursor: Date; requests: any[] }) {
  const dayItems = requests.filter(r => isSameDay(r.pickupBy, cursor));
  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 5am – 10pm
  return (
    <div>
      {dayItems.length === 0 ? (
        <Empty msg="No transports scheduled for this day." />
      ) : (
        <div className="grid grid-cols-[60px_1fr] gap-px bg-gray-100 rounded-lg overflow-hidden text-sm">
          {hours.map(h => {
            const slotItems = dayItems.filter(r => r.pickupBy.getHours() === h);
            return (
              <>
                <div key={`l-${h}`} className="bg-white px-2 py-2 text-xs text-gray-500 text-right">
                  {format(new Date(2000, 0, 1, h, 0), 'h a')}
                </div>
                <div key={`s-${h}`} className="bg-white px-2 py-2 min-h-12">
                  {slotItems.length === 0 ? (
                    <span className="text-[10px] text-gray-300">—</span>
                  ) : (
                    <ul className="space-y-1">
                      {slotItems.map(r => (
                        <li key={r.id}>
                          <Link href={`/transport/requests/${r.id}`} className="block rounded-md px-2 py-1.5 hover:shadow-sm transition text-xs"
                            style={{
                              background: !r.volunteerId
                                ? '#fef2f2'
                                : r.status === 'in_transit'
                                ? '#f0f9ff'
                                : r.status === 'delivered'
                                ? '#ecfdf5'
                                : '#fefce8',
                            }}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-medium truncate">{r.fromAddress} → {r.toAddress}</span>
                              <span className="text-[10px] text-gray-500">{format(r.pickupBy, 'h:mm a')}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {r.volunteer ? r.volunteer.name : <span className="text-red-700 font-semibold">UNASSIGNED</span>}
                              {' · '}{r.urgency}{' · '}{r.status.replace('_', ' ')}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- WEEK VIEW ----------
function WeekView({ cursor, requests }: { cursor: Date; requests: any[] }) {
  const start = startOfWeek(cursor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end: endOfWeek(cursor, { weekStartsOn: 0 }) });
  return (
    <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
      {days.map(d => {
        const dayItems = requests.filter(r => isSameDay(r.pickupBy, d));
        const today_ = isToday(d);
        return (
          <div key={d.toISOString()} className="bg-white p-2 min-h-32 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <div className={`text-xs font-semibold ${today_ ? 'text-teal-700' : 'text-gray-500'}`}>{format(d, 'EEE')}</div>
              <div className={`inline-flex items-center justify-center text-xs font-semibold ${today_ ? 'h-6 w-6 rounded-full bg-teal-600 text-white' : 'text-gray-700'}`}>
                {format(d, 'd')}
              </div>
            </div>
            <div className="space-y-1 flex-1 overflow-hidden">
              {dayItems.length === 0 && <span className="text-[10px] text-gray-300">—</span>}
              {dayItems.slice(0, 5).map(r => (
                <Link key={r.id} href={`/transport/requests/${r.id}`} className="block">
                  <div className={`text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${
                    !r.volunteerId ? 'bg-red-50 text-red-800'
                    : r.status === 'in_transit' ? 'bg-sky-50 text-sky-800'
                    : r.status === 'delivered' ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-yellow-50 text-yellow-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{r.volunteer?.name ?? 'OPEN'}</span>
                      <span className="opacity-70 flex-shrink-0">{format(r.pickupBy, 'h:mm a')}</span>
                    </div>
                  </div>
                </Link>
              ))}
              {dayItems.length > 5 && <div className="text-[10px] text-gray-500">+{dayItems.length - 5} more</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- MONTH VIEW ----------
function MonthView({ cursor, requests }: { cursor: Date; requests: any[] }) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 0 }), end: endOfWeek(monthEnd, { weekStartsOn: 0 }) });
  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 text-xs font-semibold text-gray-500 rounded-t-lg overflow-hidden">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="bg-white px-2 py-1.5 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-b-lg overflow-hidden">
        {days.map(d => {
          const dayItems = requests.filter(r => isSameDay(r.pickupBy, d));
          const inMonth = isSameMonth(d, cursor);
          const today_ = isToday(d);
          return (
            <div key={d.toISOString()} className={`bg-white min-h-20 md:min-h-24 p-1.5 flex flex-col gap-0.5 ${inMonth ? '' : 'bg-gray-50 text-gray-400'}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center justify-center text-xs font-semibold ${today_ ? 'h-6 w-6 rounded-full bg-teal-600 text-white' : 'text-gray-700'}`}>
                  {format(d, 'd')}
                </span>
                {dayItems.length > 0 && <span className="text-[10px] text-gray-400">{dayItems.length}</span>}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayItems.slice(0, 3).map(r => (
                  <Link key={r.id} href={`/transport/requests/${r.id}`}>
                    <div className={`text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${
                      !r.volunteerId ? 'bg-red-50 text-red-800'
                      : r.status === 'in_transit' ? 'bg-sky-50 text-sky-800'
                      : r.status === 'delivered' ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-yellow-50 text-yellow-800'
                    }`}>
                      {r.volunteer?.name ?? 'OPEN'}
                    </div>
                  </Link>
                ))}
                {dayItems.length > 3 && <div className="text-[10px] text-gray-500 px-1">+{dayItems.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
