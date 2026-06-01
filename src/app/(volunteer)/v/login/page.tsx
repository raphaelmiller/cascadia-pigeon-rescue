// Volunteer-portal login page (magic link).
//
// Two sign-in paths:
//   1. Magic link  -- always available. Enter email, get an emailed link.
//   2. Dev bypass  -- only rendered when DEV_BYPASS_AUTH=1. Pick a
//                      volunteer from a dropdown and you're signed in.
//                      For demos and local testing only.

import { redirect } from 'next/navigation';
import { issueMagicLink } from '@/lib/volunteer/magic-link';
import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function startSignInAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextParam = String(formData.get('next') ?? '/');
  const redirectTo = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = (h.get('x-forwarded-proto') ?? 'http').split(',')[0].trim();
  const origin = `${proto}://${host}`;

  await issueMagicLink({
    email,
    redirectTo,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
    origin,
  });
  redirect('/auth/sent');
}

async function devBypassSignInAction(formData: FormData) {
  'use server';
  // Server-side guard mirrors the provider's authorize() check so we
  // don't accidentally serve this when the flag is off.
  if (process.env.DEV_BYPASS_AUTH !== '1') {
    redirect('/login?error=invalid');
  }
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextParam = String(formData.get('next') ?? '/');
  const redirectTo = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  await signIn('volunteer-dev-bypass', { email, redirectTo });
}

export default async function VolunteerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') ? sp.next : '/';
  const bypassEnabled = process.env.DEV_BYPASS_AUTH === '1';

  // When bypass is on, pre-load the list of available volunteers so
  // the dropdown is one-tap (no typing emails).
  const bypassOptions = bypassEnabled
    ? await prisma.volunteerProfile.findMany({
        where: { disabledAt: null },
        select: { email: true, name: true, roleTags: true, isCoordinator: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white text-xl">
            🕊️
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">CPR Volunteer</h1>
            <p className="text-xs text-gray-500">
              {bypassEnabled ? 'Dev mode — pick a volunteer' : 'Sign in with a magic link'}
            </p>
          </div>
        </div>

        {bypassEnabled && (
          <form action={devBypassSignInAction} className="space-y-3 mb-5 pb-5 border-b border-dashed border-yellow-300">
            <div className="rounded-full bg-yellow-50 ring-1 ring-yellow-200 px-3 py-2 text-[11px] text-yellow-900">
              <strong>Dev bypass is ON.</strong> Pick a volunteer to sign in
              instantly. Disable by unsetting <code>DEV_BYPASS_AUTH</code>.
            </div>
            <input type="hidden" name="next" value={next} />
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                Sign in as
              </span>
              <select
                name="email"
                required
                defaultValue=""
                className="block w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              >
                <option value="" disabled>— Pick a volunteer —</option>
                {bypassOptions.map(o => (
                  <option key={o.email} value={o.email}>
                    {o.name} {o.isCoordinator ? '★' : ''} ({o.roleTags || 'no roles'})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="w-full rounded-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium text-sm px-4 py-2.5 transition"
            >
              Sign in (dev bypass)
            </button>
          </form>
        )}

        <form action={startSignInAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
              {bypassEnabled ? 'Or use magic link' : 'Email'}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus={!bypassEnabled}
              className="block w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              placeholder="you@example.com"
            />
          </div>
          {sp.error && (
            <div className="rounded-full bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs text-red-800">
              {sp.error === 'invalid' && 'That link is invalid or expired. Try again.'}
              {sp.error === 'used' && 'That link was already used. Request a new one.'}
              {sp.error === 'expired' && 'That link has expired. Request a new one.'}
              {sp.error === 'disabled' && 'Your account is disabled. Contact a coordinator.'}
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded-full bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-4 py-2.5 transition"
          >
            Email me a link
          </button>
        </form>
        <p className="mt-4 text-[11px] text-gray-400 text-center">
          New volunteer? Ask a coordinator to add you.
        </p>
      </div>
    </div>
  );
}
