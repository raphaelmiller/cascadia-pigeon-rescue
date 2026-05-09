import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { H1, H2, Card, Pill, Btn, Empty } from '@/components/ui';
import { fmtDateTime, daysUntil } from '@/lib/utils';
import { SHIFT_TYPE_TONE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const TYPE_DOT: Record<string, string> = {
  on_call: 'bg-sky-500',
  active: 'bg-emerald-500',
  emergency_backup: 'bg-orange-500',
};

export default async function RescueCalendarPage({
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

  // Pull shifts that intersect the visible window (start before gridEnd AND end after gridStart).
  const shifts = await prisma.rescueShift.findMany({
    where: { startsAt: { lte: gridEnd }, endsAt: { gte: gridStart } },
    include: { volunteer: true },
    orderBy: { startsAt: 'asc' },
  });

  // Group by yyyy-mm-dd of startsAt (treats each shift as a single-day event for the cell).
  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = format(s.startsAt, 'yyyy-MM-dd');
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }

  const selectedKey = params.day || format(today, 'yyyy-MM-dd');
  const selectedDate = new Date(selectedKey + 'T12:00:00');
  const selectedShifts = byDay.get(selectedKey) || [];

  // Operational summary across next 14 days
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
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Rescue Shift Calendar</H1>
          <p className="text-sm text-gray-600 mt-1">
            {next14.length} shifts in next 14d · {open.length} open
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn href={`/rescue/calendar?month=${prevMonth}`} variant="ghost">←</Btn>
          <Btn href={`/rescue/calendar?month=${format(today, 'yyyy-MM')}`} variant="ghost">Today</Btn>
          <Btn href={`/rescue/calendar?month=${nextMonth}`} variant="ghost">→</Btn>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile tone="blue" label="On-call (14d)" value={onCall.length} />
        <SummaryTile tone="green" label="Active (14d)" value={active.length} />
        <SummaryTile tone="orange" label="Emergency backup" value={backup.length} />
        <SummaryTile tone={open.length ? 'red' : 'green'} label="Open shifts" value={open.length} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">{format(cursor, 'MMMM yyyy')}</h2>
          <span className="text-xs text-gray-500">{shifts.length} shift{shifts.length !== 1 ? 's' : ''} this month</span>
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
                href={`/rescue/calendar?month=${format(cursor, 'yyyy-MM')}&day=${key}`}
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
                  {items.slice(0, 3).map(s => {
                    const tone = !s.volunteerId
                      ? 'bg-red-50 text-red-800'
                      : s.shiftType === 'emergency_backup'
                      ? 'bg-orange-50 text-orange-800'
                      : s.shiftType === 'active'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-sky-50 text-sky-800';
                    return (
                      <div key={s.id} className={`flex items-center gap-1 text-[10px] md:text-xs leading-tight rounded px-1 py-0.5 truncate ${tone}`}>
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${TYPE_DOT[s.shiftType] || 'bg-gray-400'}`} />
                        <span className="truncate">
                          {s.volunteer?.name ?? 'OPEN'}
                          {s.area ? ` · ${s.area}` : ''}
                        </span>
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
