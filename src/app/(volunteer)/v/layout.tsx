// Volunteer-portal root layout.
//
// IMPORTANT: this is its own root layout. It owns <html>/<body> for any
// request that came in on the volunteer host (which middleware rewrites
// into /v/*). The admin root layout (src/app/layout.tsx) handles every
// other request.
//
// Per Next.js docs: navigating between routes with different root
// layouts triggers a full page reload \u2014 acceptable here because we
// never link directly between admin and volunteer surfaces, and the
// hosts are different anyway.

import '../../globals.css';
import type { Metadata } from 'next';
import { VolunteerNav } from '@/components/volunteer/VolunteerNav';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseRoleTags } from '@/lib/volunteer/roles';

export const metadata: Metadata = {
  title: 'CPR Volunteer Portal',
  description: 'Cascadia Pigeon Rescue — volunteer dashboard.',
  applicationName: 'CPR Volunteer',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f766e',
};

export default async function VolunteerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pull the logged-in profile's role tags so the nav knows what to show.
  // Cheap query \u2014 single row, indexed, cached per request by Prisma's
  // internal request-scoped cache when paired with React cache().
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  let roleTags: string[] = [];
  let isCoordinator = false;
  if (role === 'volunteer') {
    const profileId = (session!.user as { profileId?: string }).profileId;
    if (profileId) {
      const p = await prisma.volunteerProfile.findUnique({
        where: { id: profileId },
        select: { roleTags: true, isCoordinator: true },
      });
      if (p) {
        roleTags = parseRoleTags(p.roleTags);
        isCoordinator = p.isCoordinator;
      }
    }
  }
  return (
    <html lang="en">
      <body className="min-h-screen pb-24 md:pb-0 bg-gradient-to-br from-teal-50/40 via-white to-sky-50/40">
        <VolunteerNav roleTags={roleTags} isCoordinator={isCoordinator} signedIn={role === 'volunteer'} />
        <main className="mx-auto max-w-3xl px-4 py-4 md:py-6">{children}</main>
      </body>
    </html>
  );
}
