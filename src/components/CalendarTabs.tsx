import Link from 'next/link';
import { Calendar as CalIcon, Truck, Siren } from 'lucide-react';

export type CalTab = 'all' | 'transport' | 'rescue';

const TABS: { id: CalTab; label: string; icon: typeof CalIcon }[] = [
  { id: 'all',       label: 'All events',     icon: CalIcon },
  { id: 'transport', label: 'Transport',      icon: Truck },
  { id: 'rescue',    label: 'Rescue shifts',  icon: Siren },
];

export function CalendarTabs({
  active,
  monthCursor,
  selectedDay,
  view,
}: {
  active: CalTab;
  monthCursor: string;
  selectedDay: string;
  view?: string;
}) {
  return (
    <div className="inline-flex rounded-xl bg-gray-100 p-1 ring-1 ring-gray-200">
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        const params = new URLSearchParams({ tab: id, month: monthCursor, day: selectedDay });
        if (view) params.set('view', view);
        return (
          <Link
            key={id}
            href={`/calendar?${params.toString()}`}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
