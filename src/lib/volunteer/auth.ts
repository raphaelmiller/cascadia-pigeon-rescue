// Volunteer auth guard \u2014 the volunteer-portal counterpart to
// lib/auth.ts:requireOperator().
//
// Call at the top of every server action and page that needs to know
// who the volunteer is. Redirects to the volunteer-portal /login on
// failure (NOT the admin login).

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseRoleTags, type RoleTag, hasAnyRole } from './roles';

export type VolunteerSession = {
  profileId: string;
  email: string;
  name: string;
  roleTags: RoleTag[];
  isCoordinator: boolean;
  fosterId: string | null;
  transportId: string | null;
  rescueId: string | null;
};

/**
 * Look up the active volunteer profile from the session token. Throws
 * (via redirect) if there isn't one.
 *
 * Cached per-request via React's cache() so multiple callers within a
 * single render don't hammer the DB.
 */
import { cache } from 'react';

export const requireVolunteer = cache(async (): Promise<VolunteerSession> => {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== 'volunteer') {
    redirect('/login');
  }
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) {
    redirect('/login');
  }
  const profile = await prisma.volunteerProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true, email: true, name: true, roleTags: true,
      isCoordinator: true, fosterId: true, transportId: true,
      rescueId: true, disabledAt: true,
    },
  });
  if (!profile || profile.disabledAt) {
    redirect('/login');
  }
  return {
    profileId: profile.id,
    email: profile.email,
    name: profile.name,
    roleTags: parseRoleTags(profile.roleTags),
    isCoordinator: profile.isCoordinator,
    fosterId: profile.fosterId,
    transportId: profile.transportId,
    rescueId: profile.rescueId,
  };
});

/** Guard for routes that require a specific role tag. */
export async function requireRole(want: RoleTag): Promise<VolunteerSession> {
  const v = await requireVolunteer();
  if (!v.roleTags.includes(want)) {
    redirect('/'); // back to their dashboard
  }
  return v;
}

/** Guard for routes that require any one of a set. */
export async function requireAnyRole(want: RoleTag[]): Promise<VolunteerSession> {
  const v = await requireVolunteer();
  if (!want.some(r => v.roleTags.includes(r))) {
    redirect('/');
  }
  return v;
}

/** Permission helper, non-throwing. */
export function can(v: VolunteerSession, want: RoleTag | RoleTag[]): boolean {
  const tags = Array.isArray(want) ? want : [want];
  return hasAnyRole(v.roleTags.join(','), tags);
}
