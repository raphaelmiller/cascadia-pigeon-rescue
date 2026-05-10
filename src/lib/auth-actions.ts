'use server';

import { signOut } from '@/auth';

/**
 * Server actions related to auth. Lives in a separate file so it can be
 * imported by client components without dragging the entire auth module
 * (which references node:crypto + next-auth internals) into the client
 * bundle.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
