import Link from 'next/link';
import { H1, Card } from '@/components/ui';
import {
  Truck, Siren, Bandage, Boxes, BellRing, Calendar, NotebookPen, Inbox, Pill,
  Bird, Home, LayoutDashboard, Archive,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const ALL_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'Rescue command center' },
  { href: '/digest', label: 'Daily digest', icon: BellRing, desc: 'Next 48h + weekly overview' },
  { href: '/birds', label: 'Birds', icon: Bird, desc: 'Every bird from intake to outcome' },
  { href: '/fosters', label: 'Fosters', icon: Home, desc: 'Foster homes + stress monitoring' },
  { href: '/medications', label: 'Medications', icon: Pill, desc: 'Refill alerts, reassessments' },
  { href: '/requests', label: 'Requests', icon: Inbox, desc: 'Foster portal' },
  { href: '/updates', label: 'Daily updates', icon: NotebookPen, desc: 'Bird health + foster stress' },
  { href: '/calendar', label: 'Calendar', icon: Calendar, desc: 'Vet, bandage, refill, transfer' },
  { href: '/transport', label: 'Transport', icon: Truck, desc: 'Drivers + transport requests' },
  { href: '/rescue', label: 'Rescue shifts', icon: Siren, desc: 'On-call coverage + responders' },
  { href: '/bandages', label: 'Bandage tasks', icon: Bandage, desc: 'Recurring bandage changes' },
  { href: '/supplies', label: 'Supply inventory', icon: Boxes, desc: 'Stock + low-stock alerts' },
  { href: '/archive', label: 'Archive & Trash', icon: Archive, desc: 'Restore archived or deleted records' },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <H1>All modules</H1>
      <div className="grid gap-3 sm:grid-cols-2">
        {ALL_LINKS.map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition cursor-pointer h-full">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
