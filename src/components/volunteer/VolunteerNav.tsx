'use client';
// Volunteer-portal nav. Mobile-first; mirrors the admin Nav's grid-bottom
// pattern but with a different vocabulary and role-tag awareness.
//
// Per Christina: roles are tags, the nav shows ALL activities matching
// ANY tag, organized by activity type. Coordinator gets one extra entry.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Bird, Truck, Siren, Calendar, User, LogOut, Inbox, Trophy,
} from 'lucide-react';
import { logoutAction } from '@/lib/auth-actions';
import { activitiesFor } from '@/lib/volunteer/roles';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  activity?: 'rescue' | 'transport' | 'foster' | 'coordination' | 'outreach' | 'always';
};

// All possible items; filtered at render time by role tags.
const ITEMS: NavItem[] = [
  { href: '/',               label: 'Home',     icon: Home,     activity: 'always' },
  { href: '/birds',          label: 'My Birds', icon: Bird,     activity: 'foster' },
  { href: '/transport',      label: 'Transport',icon: Truck,    activity: 'transport' },
  { href: '/rescue',         label: 'Rescue',   icon: Siren,    activity: 'rescue' },
  { href: '/shifts',         label: 'Shifts',   icon: Calendar, activity: 'always' },
  { href: '/service-record', label: 'Record',   icon: Trophy,   activity: 'always' },
  { href: '/profile',        label: 'Profile',  icon: User,     activity: 'always' },
];

const COORDINATOR_ITEMS: NavItem[] = [
  { href: '/dispatch', label: 'Dispatch', icon: Inbox, activity: 'always' },
];

export function VolunteerNav({
  roleTags,
  isCoordinator,
  signedIn,
}: {
  roleTags: string[];
  isCoordinator: boolean;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  // Hide nav on auth pages \u2014 they have their own minimal chrome.
  if (pathname === '/login' || pathname.startsWith('/auth/')) return null;
  if (!signedIn) return null;

  const activities = new Set([...activitiesFor(roleTags.join(',')), 'always']);
  const visible = ITEMS.filter(i =>
    i.activity === undefined || activities.has(i.activity)
  );
  const all = [
    ...visible,
    ...(isCoordinator ? COORDINATOR_ITEMS : []),
  ];

  return (
    <>
      {/* Desktop header */}
      <header className="sticky top-0 z-30 hidden md:block bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white">🕊️</span>
            <span>CPR Volunteer</span>
          </Link>
          <nav className="flex items-center gap-1">
            {all.map(item => {
              const { href, label, icon: Icon } = item;
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </form>
          </nav>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 md:hidden bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white">🕊️</span>
            <span className="text-sm">CPR Volunteer</span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
              <LogOut size={12} /> Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Mobile bottom tab bar. Caps at 7 columns so a coordinator with
          the full nav (Home, Birds, Transport, Rescue, Shifts, Profile,
          Dispatch) still sees Dispatch. At 375px width 7 tabs is tight
          but tappable; beyond that we'd need a "More" overflow drawer
          which is deferred until a real volunteer hits the limit. */}
      <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white border-t border-gray-200">
        <ul className={`grid`} style={{ gridTemplateColumns: `repeat(${Math.min(all.length, 7)}, 1fr)` }}>
          {all.slice(0, 7).map(item => {
            const { href, label, icon: Icon } = item;
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  className={`flex flex-col items-center justify-center py-2 text-[10px] ${
                    active ? 'text-teal-700' : 'text-gray-500'
                  }`}
                >
                  <Icon size={20} />
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
