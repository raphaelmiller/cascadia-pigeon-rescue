import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { H1, H2, Card, Pill, Btn, Empty } from '@/components/ui';
import { fmtDateTime, daysUntil, isOverdue } from '@/lib/utils';
import { TRANSPORT_STATUS_TONE, URGENCY_TONE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<string, string> = {
  open: 'bg-orange-500',
  assigned: 'bg-yellow-400',
  in_transit: 'bg-sky-500',
  delivered: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
};

export default async function TransportCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const params = await searchParams;
  const today = new Date();
  let cursor = today;
  if (params.month) {
    const [y, m] = params.month.split('-').map(Number);
    if (y && m) cursor = new Date(y, m - 1, 1);
  }
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const prevMonth = format(subMonths(cursor, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(cursor, 1), 'yyyy-MM');

  const transports = await prisma.transportRequest.findMany({
    where: { pickupBy: { gte: gridStart, lte: gridEnd } },
    include: { volunteer: true },
    orderBy: { pickupBy: 'asc' },
  });

  const byDay = new Map<string, typeof transports>();
  for (const t of transports) {
    const k = format(t.pickupBy, 'yyyy-MM-dd');
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(t);
  }

  const selectedKey = params.day || format(today, 'yyyy-MM-dd');
  const selectedDate = new Date(selectedKey + 'T12:00:00');
  const selectedItems = byDay.get(selectedKey) || [];

  // Operational summary across the full open list (not just this month).
  const allActive = await prisma.transportRequest.findMany({
    where: { status: { in: ['open', 'assigned', 'in_transit'] } },
    include: { volunteer: true },
    orderBy: { pickupBy: 'asc' },
  });
  const unassigned = allActive.filter(t => !t.volunteerId);
  const pending = allActive.filter(t => t.status === 'open');
  const inTransit = allActive.filter(t => t.status === 'in_transit');
  const next7 = allActive.filter(t => (daysUntil(t.pickupBy) ?? 99) <= 7);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Transport Calendar</H1>
          <p className="text-sm text-gray-600 mt-1">
            {allActive.length} active · {unassigned.length} unassigned · {inTransit.length} in transit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn href={`/transport/calendar?month=${prevMonth}`} variant="ghost">←</Btn>
          <Btn href={`/transport/calendar?month=${format(today, 'yyyy-MM')}`} variant="ghost">Today</Btn>
          <Btn href={`/transport/calendar?month=${nextMonth}`} variant="ghost">→</Btn>
        </div>
      </div>

      {/* Operational summary tiles */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile tone={pending.length ? 'orange' : 'green'} label="Pending" value={pending.length} />
        <SummaryTile tone={unassigned.length ? 'red' : 'green'} label="Unassigned" value={unassigned.length} />
        <SummaryTile tone={inTransit.length ? 'blue' : 'gray'} label="In transit" value={inTransit.length} />
        <SummaryTile tone={next7.length ? 'yellow' : 'green'} label="Next 7 days" value={next7.length} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">{format(cursor, 'MMMM yyyy')}</h2>
          <span className="text-xs text-gray-500">{transports.length} transport{transports.length !== 1 ? 's' : ''} this month</span>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 text-xs font-semibold text-gray-500 rounded-t-lg overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-white px-2 py-1.5 text-center">{d}</div>
          ))}
        </div>

        {/* Grid */}
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
                href={`/transport/calendar?month=${format(cursor, 'yyyy-MM')}&day=${key}`}
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
                  {items.length > 0 && <span className="text-[10px] text-gray-400">{items.length}</span>}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {items.slice(0, 3).map(t => {
                    const tone = !t.volunteerId
                      ? 'bg-red-50 text-red-800'
                      : t.status === 'in_transit'
                      ? 'bg-sky-50 text-sky-800'
                      : t.status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-yellow-50 text-yellow-800';
                    return (
                      <div key={t.id} className={`flex items-center gap-1 text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${tone}`}>
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[t.status] || 'bg-gray-400'}`} />
                        <span className="truncate">{t.fromAddress.slice(0, 18)} → {t.toAddress.slice(0, 18)}</span>
                      </div>
                    );
                  })}
                  {items.length > 3 && (
                    <div className="text-[10px] text-gray-500 px-1">+{items.length - 3} more</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Selected day */}
      <Card tone={selectedItems.length ? 'blue' : 'gray'}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <H2>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</H2>
          <span className="text-xs text-gray-500">{selectedItems.length} transport{selectedItems.length !== 1 ? 's' : ''}</span>
        </div>
        {selectedItems.length === 0 ? <Empty msg="No transports scheduled for this day." /> : (
          <ul className="divide-y divide-gray-100">
            {selectedItems.map(t => {
              const overdue = !['delivered', 'cancelled'].includes(t.status) && isOverdue(t.pickupBy);
              return (
                <li key={t.id} className="py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={URGENCY_TONE[t.urgency] || 'gray'}>{t.urgency}</Pill>
                    <Pill tone={TRANSPORT_STATUS_TONE[t.status] || 'gray'}>{t.status.replace('_', ' ')}</Pill>
                    {!t.volunteerId && <Pill tone="red">UNASSIGNED</Pill>}
                    {overdue && <Pill tone="red">overdue</Pill>}
                    <span className="text-xs text-gray-500 ml-auto">{fmtDateTime(t.pickupBy)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>{t.fromAddress}</strong> → <strong>{t.toAddress}</strong>
                  </div>
                  {t.description && <p className="text-sm text-gray-600 mt-0.5">{t.description}</p>}
                  {t.volunteer && <p className="text-xs text-gray-500 mt-0.5">Driver: <strong>{t.volunteer.name}</strong>{t.volunteer.phone ? ` · ${t.volunteer.phone}` : ''}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <Btn href="/transport" variant="ghost">→ Manage transports</Btn>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card tone={tone}>
      <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">{label}</div>
    </Card>
  );
}
