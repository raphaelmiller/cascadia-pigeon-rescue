import '../globals.css';
import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { MaybeMain } from '@/components/MaybeMain';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export const metadata: Metadata = {
  title: 'Cascadia Pigeon Rescue · Operations',
  description: 'Internal rescue operations management for Cascadia Pigeon Rescue.',
  applicationName: 'CPR Ops',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f766e',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // PR E: pull the active needs_rescue count once per request so the
  // bottom-nav Emergency tab can render a live badge. We only query
  // when a user is signed in — the count would be useless on /login,
  // and skipping the DB hit there keeps the login screen snappy.
  const session = await auth();
  let needsRescueCount = 0;
  if (session?.user) {
    try {
      needsRescueCount = await prisma.rescueCase.count({
        where: { status: 'needs_rescue', archivedAt: null, deletedAt: null },
      });
    } catch {
      // If the query fails for any reason (e.g. DB hiccup), don't take
      // the whole app down — just show the badge as 0.
      needsRescueCount = 0;
    }
  }
  return (
    <html lang="en">
      <body className="min-h-screen pb-24 md:pb-0">
        <Nav needsRescueCount={needsRescueCount} />
        <MaybeMain>{children}</MaybeMain>
      </body>
    </html>
  );
}
