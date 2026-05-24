import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { timingSafeEqual } from 'node:crypto';
import { authConfig } from '@/auth.config';
import { consumeMagicLink } from '@/lib/volunteer/magic-link';

/**
 * Full auth config -- extends the edge-safe slice in `auth.config.ts`
 * with the runtime providers. Used everywhere except middleware (which
 * can't load Node-only modules like `node:crypto`).
 *
 * Two providers:
 *   - 'credentials'      -- admin password sign-in. Single shared
 *                          ADMIN_PASSWORD; rotate to force re-login.
 *   - 'volunteer-token'  -- magic-link sign-in for the volunteer
 *                          portal. The /v/auth/callback page calls
 *                          signIn('volunteer-token', { token: rawToken })
 *                          after the user clicks the link in their email.
 *
 * Both providers stamp a `role` on the User which flows into the JWT
 * via the callbacks in auth.config.ts. Middleware checks role + host.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.alloc(64);
  const bufB = Buffer.alloc(64);
  bufA.write(a.slice(0, 64));
  bufB.write(b.slice(0, 64));
  const lengthMatch = a.length === b.length;
  return timingSafeEqual(bufA, bufB) && lengthMatch;
}

type AdminUser = { id: string; name: string; email: string | null; role: 'admin' };
type VolunteerUser = { id: string; name: string; email: string | null; role: 'volunteer'; profileId: string };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Admin password',
      credentials: { password: { label: 'Password', type: 'password' } },
      authorize: async (credentials) => {
        const submitted = String(credentials?.password ?? '');
        const expected = process.env.ADMIN_PASSWORD ?? '';
        if (!expected) {
          console.error('[auth] ADMIN_PASSWORD env var is not set; rejecting login.');
          return null;
        }
        if (submitted.length === 0) return null;
        if (!constantTimeEquals(submitted, expected)) return null;
        const user: AdminUser = {
          id: 'admin',
          name: 'Admin',
          email: null,
          role: 'admin',
        };
        return user;
      },
    }),
    Credentials({
      id: 'volunteer-token',
      name: 'Volunteer magic link',
      credentials: { token: { label: 'Token', type: 'text' } },
      authorize: async (credentials) => {
        const raw = String(credentials?.token ?? '');
        if (!raw) return null;
        const result = await consumeMagicLink(raw);
        if (!result.ok) return null;
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.volunteerProfile.findUnique({
          where: { id: result.profileId },
          select: { id: true, name: true, email: true },
        });
        if (!profile) return null;
        const user: VolunteerUser = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: 'volunteer',
          profileId: profile.id,
        };
        return user;
      },
    }),
    // ----------------------------------------------------------------
    // DEV-BYPASS provider. Active ONLY when DEV_BYPASS_AUTH=1. The
    // login page renders a volunteer dropdown that posts here; we
    // accept the email at face value with no token / no email send.
    //
    // GUARDS:
    //   1. authorize() refuses unless DEV_BYPASS_AUTH=1 is set on the
    //      server at request time (defense-in-depth in case the env
    //      is flipped off but the provider is still registered).
    //   2. authorize() refuses in production (NODE_ENV==='production')
    //      unconditionally. To enable in a hosted demo, set NODE_ENV
    //      to development OR set DEV_BYPASS_FORCE=1 (explicit foot-gun).
    // ----------------------------------------------------------------
    Credentials({
      id: 'volunteer-dev-bypass',
      name: 'Volunteer dev bypass',
      credentials: { email: { label: 'Email', type: 'text' } },
      authorize: async (credentials) => {
        const enabled = process.env.DEV_BYPASS_AUTH === '1';
        const isProd = process.env.NODE_ENV === 'production';
        const forced = process.env.DEV_BYPASS_FORCE === '1';
        if (!enabled) return null;
        if (isProd && !forced) {
          console.error('[auth] dev-bypass refused in production');
          return null;
        }
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        if (!email) return null;
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.volunteerProfile.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, disabledAt: true },
        });
        if (!profile || profile.disabledAt) return null;
        console.warn(`[auth] DEV-BYPASS sign-in granted to ${email}`);
        await prisma.volunteerProfile.update({
          where: { id: profile.id },
          data: { lastLoginAt: new Date() },
        });
        const user: VolunteerUser = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: 'volunteer',
          profileId: profile.id,
        };
        return user;
      },
    }),
  ],
});
