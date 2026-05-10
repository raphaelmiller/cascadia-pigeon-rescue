import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/**
 * auth.ts — call this at the top of every server action and API route
 * that mutates data. With the credentials provider wired up, a logged-out
 * caller hits the login page; logged-in callers proceed.
 *
 * The middleware already gates page navigations, but server actions and
 * direct API hits still need an explicit check because they can be POSTed
 * from anywhere with a valid CSRF + cookie.
 */

export type Operator = {
  id: string;
  name: string | null;
  email: string | null;
  role: 'admin';
};

export async function requireOperator(): Promise<Operator> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return {
    id: (session.user as { id?: string }).id ?? 'admin',
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    role: 'admin',
  };
}

// `logoutAction` lives in src/lib/auth-actions.ts (separate file so client
// components can import it without pulling next-auth internals into the
// client bundle). Import it from there directly.

