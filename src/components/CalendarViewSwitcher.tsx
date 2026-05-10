import Link from 'next/link';
import { CalendarDays, CalendarRange, LayoutGrid } from 'lucide-react';

export type CalView = 'day' | 'week' | 'month';

const VIEWS: { id: CalView; label: string; icon: typeof CalendarDays }[] = [
  { id: 'day',   label: 'Day',   icon: CalendarDays },
  { id: 'week',  label: 'Week',  icon: CalendarRange },
  { id: 'month', label: 'Month', icon: LayoutGrid },
];

export function CalendarViewSwitcher({
  active,
  tab,
  monthCursor,
  selectedDay,
}: {
  active: CalView;
  tab: string;
  monthCursor: string;
  selectedDay: string;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 ring-1 ring-gray-200">
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        const params = new URLSearchParams({ tab, view: id, month: monthCursor, day: selectedDay });
        return (
          <Link
            key={id}
            href={`/calendar?${params.toString()}`}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              isActive
                ? 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={13} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
