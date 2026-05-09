'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Bird, Home, Pill, Inbox, NotebookPen, Calendar,
  Truck, Siren, Bandage, Boxes, BellRing, Archive,
} from 'lucide-react';

const PRIMARY_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/birds', label: 'Birds', icon: Bird },
  { href: '/fosters', label: 'Fosters', icon: Home },
  { href: '/medications', label: 'Meds', icon: Pill },
  { href: '/requests', label: 'Requests', icon: Inbox },
];

const SECONDARY_NAV = [
  { href: '/digest', label: 'Digest', icon: BellRing },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/updates', label: 'Updates', icon: NotebookPen },
  { href: '/transport', label: 'Transport', icon: Truck },
  { href: '/rescue', label: 'Rescue', icon: Siren },
  { href: '/bandages', label: 'Bandages', icon: Bandage },
  { href: '/supplies', label: 'Supplies', icon: Boxes },
  { href: '/archive', label: 'Archive', icon: Archive },
];

const MOBILE_NAV = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/birds', label: 'Birds', icon: Bird },
  { href: '/fosters', label: 'Fosters', icon: Home },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/digest', label: 'Digest', icon: BellRing },
  { href: '/more', label: 'More', icon: Boxes },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop / tablet header */}
      <header className="sticky top-0 z-30 hidden md:block bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold flex-shrink-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white">🕊️</span>
            <span>CPR Ops</span>
          </Link>
          <nav className="flex items-center gap-1 flex-wrap justify-end">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    active ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 md:hidden bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white">🕊️</span>
            <span>CPR Ops</span>
          </Link>
          <span className="text-xs text-gray-500">Operations</span>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white border-t border-gray-200">
        <ul className="grid grid-cols-6">
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex flex-col items-center justify-center py-2 text-[10px] ${
                    active ? 'text-teal-700' : 'text-gray-500'
                  }`}
                >
                  <Icon size={20} />
                  <span className="mt-0.5">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
