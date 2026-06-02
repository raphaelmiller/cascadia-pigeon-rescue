import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { authConfig } from '@/auth.config';

/**
 * Auth + tenant middleware. Runs in the Edge runtime; only the edge-safe
 * slice of auth config is imported.
 *
 * Two tenants distinguished by hostname:
 *   \u2022 admin / root host  \u2192 admin portal (existing app, all current routes)
 *   \u2022 volunteer host     \u2192 volunteer portal, served from /v/* internally
 *
 * The volunteer host is detected by checking the leftmost label of the
 * hostname against VOLUNTEER_HOST_PREFIX (default: "volunteer"). In dev
 * you reach it at http://volunteer.localhost:3000.
 *
 * Routing model: requests to the volunteer host are REWRITTEN so the
 * URL path "/foo" becomes "/v/foo" internally. The user never sees the
 * "/v" prefix in the address bar; Next.js routes the request to files
 * under src/app/v/. This avoids the route-group "two root layouts both
 * own /" collision documented in node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/route-groups.md.
 *
 * Auth model:
 *   \u2022 An admin session (role='admin') CANNOT access the volunteer host.
 *   \u2022 A volunteer session (role='volunteer') CANNOT access the admin host.
 *   \u2022 Unauthenticated requests redirect to /login on the right host.
 *
 * Login is served at /login on both hosts. The page itself dispatches
 * to the right provider based on the host it's rendered under.
 */

const { auth } = NextAuth(authConfig);

const PUBLIC_ADMIN_PATHS = new Set<string>([
  '/login',
  '/api/health',
  '/api/dispatch/sweep', // header-token-protected cron endpoint
  '/api/dispatch/digest', // header-token-protected cron endpoint
]);

// Volunteer-portal public paths. These are URL-bar paths the user sees;
// after rewrite they become /v/<path>.
const PUBLIC_VOLUNTEER_PATHS = new Set<string>([
  '/login',
  '/auth/callback',
  '/auth/sent',
  '/api/health',
]);

function isStatic(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (/^\/[\w-]+\.(svg|png|ico|webmanifest|jpg|jpeg|webp|gif)$/i.test(pathname)) return true;
  return false;
}

function isVolunteerHost(host: string): boolean {
  // Strip port. host can be "volunteer.localhost:3000".
  const bare = host.split(':')[0].toLowerCase();

  // Explicit override list — used when the public hostname doesn't
  // follow the conventional "<prefix>." pattern (e.g. temporary
  // tunnel URLs like xyz.trycloudflare.com). Comma-separated.
  const explicit = (process.env.VOLUNTEER_HOSTNAMES || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (explicit.includes(bare)) return true;

  // Conventional pattern — default "volunteer." subdomain.
  const prefix = (process.env.VOLUNTEER_HOST_PREFIX || 'volunteer').toLowerCase();
  if (bare === prefix) return true;
  return bare.startsWith(prefix + '.');
}

type AuthedReq = NextRequest & { auth: Session | null };

/**
 * PR L follow-up (2026-06-01): when dev-bypass is on AND the operator hits
 * an explicit /v/* path on the admin host, treat the request as a volunteer
 * host request. This is the QA shortcut: production volunteer host isn't
 * provisioned (would need a custom domain or sibling Fly app), but operators
 * still need to inspect the volunteer surface across personas. This branch
 * only activates when BOTH DEV_BYPASS_AUTH=1 and DEV_BYPASS_FORCE=1 are set,
 * which is the same triple-lock that gates the credentials provider itself.
 * Removing the secrets disables both at once.
 */
function isDevBypassActive(): boolean {
  return process.env.DEV_BYPASS_AUTH === '1' && process.env.DEV_BYPASS_FORCE === '1';
}

export default auth((req) => {
  const r = req as AuthedReq;
  const url = r.nextUrl;
  const { pathname, search } = url;
  const host = r.headers.get('host') || '';
  const isVolunteer = isVolunteerHost(host);
  const role = (r.auth?.user as { role?: string } | undefined)?.role ?? null;

  // Pass-through for static + next-auth.
  if (isStatic(pathname)) return NextResponse.next();

  // Dev-bypass admin-host shortcut: when bypass is on and someone hits
  // /v/* on the admin host, treat as if the request came in on the
  // volunteer host. The path already has the /v prefix the route group
  // expects, so we just pass it straight through to NextResponse.next()
  // — no rewrite needed because /v/* IS the internal path.
  if (!isVolunteer && isDevBypassActive() && (pathname === '/v' || pathname.startsWith('/v/'))) {
    // Public paths on the volunteer surface (login, auth callback) need
    // to skip the admin-side auth gate below. Map the "user-facing" path
    // (strip /v) and check against PUBLIC_VOLUNTEER_PATHS.
    const userFacing = pathname === '/v' ? '/' : pathname.slice(2);
    if (
      PUBLIC_VOLUNTEER_PATHS.has(userFacing) ||
      userFacing.startsWith('/auth/') ||
      role === 'volunteer'
    ) {
      return NextResponse.next();
    }
    // Not signed in as volunteer and path isn't public → send to /v/login.
    const loginUrl = new URL('/v/login', r.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (isVolunteer) {
    // ---- VOLUNTEER HOST ----
    // Public path? Just rewrite into /v/ and let it through.
    if (PUBLIC_VOLUNTEER_PATHS.has(pathname) || pathname.startsWith('/auth/')) {
      return rewriteToV(req);
    }

    // Anyone here without a volunteer session goes to volunteer /login.
    if (role !== 'volunteer') {
      const loginUrl = new URL('/login', r.url);
      loginUrl.searchParams.set('next', pathname + search);
      // Force the rewrite path even on redirect: redirect target is the
      // public path the user types, not /v/login. The redirect response
      // bounces back through middleware which then rewrites.
      return NextResponse.redirect(loginUrl);
    }

    return rewriteToV(r);
  }

  // ---- ADMIN HOST (root / non-volunteer) ----
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next();

  if (!role) {
    const loginUrl = new URL('/login', r.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }
  if (role === 'volunteer') {
    // Volunteer trying to reach the admin host. Punt them home.
    // (In practice cookies are scoped per-host so this is defense-in-depth.)
    return NextResponse.redirect(new URL('/login', r.url));
  }
  return NextResponse.next();
});

function rewriteToV(req: NextRequest) {
  const url = req.nextUrl.clone();
  // Avoid double-prefixing.
  if (!url.pathname.startsWith('/v/') && url.pathname !== '/v') {
    url.pathname = '/v' + (url.pathname === '/' ? '' : url.pathname);
  }
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
