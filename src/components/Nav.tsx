'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Bird, Home, Pill, Inbox, NotebookPen, Calendar,
  Truck, Siren, Bandage, Boxes, BellRing, Archive, LogOut,
} from 'lucide-react';
import { logoutAction } from '@/lib/auth-actions';

const PRIMARY_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/birds', label: 'Birds', icon: Bird },
  { href: '/fosters', label: 'Fosters', icon: Home },
  { href: '/medications', label: 'Meds', icon: Pill },
  { href: '/requests', label: 'Requests', icon: Inbox },
];

const SECONDARY_NAV = [
  // PR E: Emergency tab — active needs_rescue cases. Lives in the
  // desktop secondary nav AND mobile bottom bar. The mobile version
  // has a red live count badge; desktop renders the same.
  { href: '/rescue/cases?status=needs_rescue', label: 'Emergency', icon: Siren, emergency: true },
  { href: '/digest', label: 'Digest', icon: BellRing },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/updates', label: 'Updates', icon: NotebookPen },
  { href: '/transport', label: 'Drivers', icon: Truck },
  { href: '/rescue', label: 'Rescuers', icon: Siren },
  { href: '/bandages', label: 'Bandages', icon: Bandage },
  { href: '/supplies', label: 'Supplies', icon: Boxes },
  { href: '/archive', label: 'Archive', icon: Archive },
];

// PR E: 7-tab mobile bottom nav (was 6). Slotted Emergency between
// Calendar and Digest where the urgency signal naturally lives.
const MOBILE_NAV = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/birds', label: 'Birds', icon: Bird },
  { href: '/fosters', label: 'Fosters', icon: Home },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/rescue/cases?status=needs_rescue', label: 'SOS', icon: Siren, emergency: true },
  { href: '/digest', label: 'Digest', icon: BellRing },
  { href: '/more', label: 'More', icon: Boxes },
];

function EmergencyBadge({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="absolute -top-0.5 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-red-600 text-white text-[9px] font-bold px-1 ring-2 ring-white"
      aria-label={`${count} bird${count === 1 ? '' : 's'} need rescue`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Nav({ needsRescueCount = 0 }: { needsRescueCount?: number }) {
  const pathname = usePathname();
  // Hide the global nav on auth pages — the login screen has its own self-contained layout.
  if (pathname === '/login') return null;
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
            <form action={logoutAction} className="order-last">
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
                title="Sign out"
              >
                <LogOut size={14} />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => {
              const { href, label, icon: Icon } = item;
              const emergency = ('emergency' in item && item.emergency === true);
              const cleanHref = href.split('?')[0];
              const active =
                href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(cleanHref);
              const emergencyClass = emergency
                ? (needsRescueCount > 0
                  ? 'bg-red-600 text-white ring-1 ring-red-700 hover:bg-red-700'
                  : 'bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100')
                : active
                ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200'
                : 'text-gray-700 hover:bg-gray-100';
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${emergencyClass}`}
                >
                  <Icon size={14} />
                  {label}
                  {emergency && <EmergencyBadge count={needsRescueCount} />}
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
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
              <LogOut size={12} /> Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white border-t border-gray-200">
        <ul className="grid grid-cols-7">
          {MOBILE_NAV.map((item) => {
            const { href, label, icon: Icon } = item;
            const emergency = ('emergency' in item && item.emergency === true);
            const cleanHref = href.split('?')[0];
            const active =
              href === '/'
                ? pathname === '/'
                : pathname.startsWith(cleanHref);
            // Emergency tab gets a red tint that becomes solid when there
            // are active cases. Normal tabs use the existing teal scheme.
            const linkClass = emergency
              ? (needsRescueCount > 0 ? 'text-red-700 font-semibold' : 'text-red-500')
              : (active ? 'text-teal-700' : 'text-gray-500');
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  className={`flex flex-col items-center justify-center py-2 text-[9px] sm:text-[10px] ${linkClass}`}
                >
                  <span className="relative">
                    <Icon size={20} />
                    {emergency && <EmergencyBadge count={needsRescueCount} />}
                  </span>
                  <span className="mt-0.5 truncate max-w-full px-0.5">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
