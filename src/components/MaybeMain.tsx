'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps page content in <main> with the standard padding, except on routes
 * that supply their own full-screen layout (login). The login page is a
 * full-bleed centered card and doesn't want the surrounding chrome.
 */
export function MaybeMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') {
    return <>{children}</>;
  }
  return <main className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-8">{children}</main>;
}
