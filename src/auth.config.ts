import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe slice of the auth config — imported by middleware.ts which runs
 * in Next.js's Edge runtime where `node:crypto` and other Node-only modules
 * are unavailable.
 *
 * The Credentials provider (which uses `node:crypto` for timing-safe compare)
 * lives in `src/auth.ts` and is the source of truth for actual sign-in.
 * Middleware just needs to know whether a session exists, which works fine
 * with the JWT strategy + an empty providers list here.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = 'admin';
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // @ts-expect-error — augmenting Session.user.
        session.user.role = token.role ?? 'admin';
        // @ts-expect-error — augmenting Session.user.
        session.user.id = token.id ?? 'admin';
      }
      return session;
    },
  },
};
