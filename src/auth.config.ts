import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe slice of the auth config -- imported by middleware.ts which
 * runs in Next.js's Edge runtime where `node:crypto` and other Node-only
 * modules are unavailable.
 *
 * Two providers live in src/auth.ts:
 *   - 'credentials'      -- admin password (existing)
 *   - 'volunteer-token'  -- magic-link token (NEW, Phase 0)
 *
 * Both produce JWTs with a `role` claim. Middleware uses the role +
 * the request host to decide which subdomain the session is allowed
 * to access.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { role?: string; id?: string; profileId?: string; email?: string | null };
        const t = token as Record<string, unknown>;
        t.role = u.role ?? 'admin';
        t.id   = u.id;
        if (u.profileId) t.profileId = u.profileId;
        if (u.email)     t.email     = u.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const t = token as Record<string, unknown>;
        const su = session.user as unknown as Record<string, unknown>;
        su.role = (t.role as string | undefined) ?? 'admin';
        su.id   = (t.id   as string | undefined) ?? 'admin';
        if (t.profileId) su.profileId = t.profileId;
        if (t.email && !session.user.email) session.user.email = t.email as string;
      }
      return session;
    },
  },
};
