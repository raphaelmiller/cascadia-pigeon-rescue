import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authConfig } from '@/auth.config';

/**
 * Auth middleware — runs in the Edge runtime, so it can only depend on the
 * edge-safe auth config (no `node:crypto`, no Credentials provider).
 *
 * Public routes (login + health probe + next-auth routes + static assets)
 * pass through unauthenticated. Everything else gets a redirect to /login
 * with the original URL preserved as ?next=.
 */

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/health',
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/^\/[\w-]+\.(svg|png|ico|webmanifest)$/i.test(pathname)) return true;
  return false;
}

export default auth((req: NextRequest & { auth?: unknown }) => {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (req.auth) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
