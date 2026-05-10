import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { timingSafeEqual } from 'node:crypto';
import { authConfig } from '@/auth.config';

/**
 * Full auth config — extends the edge-safe slice in `auth.config.ts` with
 * the Credentials provider. Used everywhere except middleware (which can't
 * load Node-only modules like `node:crypto`).
 *
 * Single shared admin password set via ADMIN_PASSWORD. Compromise = rotate
 * env and everyone is forced to re-authenticate.
 */

function constantTimeEquals(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers; pad to a fixed
  // 64-byte window so we don't leak length information.
  const bufA = Buffer.alloc(64);
  const bufB = Buffer.alloc(64);
  bufA.write(a.slice(0, 64));
  bufB.write(b.slice(0, 64));
  const lengthMatch = a.length === b.length;
  return timingSafeEqual(bufA, bufB) && lengthMatch;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
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
        return { id: 'admin', name: 'Admin', email: null };
      },
    }),
  ],
});
