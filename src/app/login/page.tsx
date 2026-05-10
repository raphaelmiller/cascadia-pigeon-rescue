import { redirect } from 'next/navigation';
import { signIn, auth } from '@/auth';
import { AuthError } from 'next-auth';

export const dynamic = 'force-dynamic';

async function loginAction(formData: FormData): Promise<void> {
  'use server';
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  try {
    await signIn('credentials', {
      password,
      redirectTo: safeNext,
    });
  } catch (err) {
    // Re-throw NEXT_REDIRECT (signIn's success path) — that's how the
    // App Router moves the user post-login. Only swallow real auth errors
    // so we can surface them via ?error=...
    if (err instanceof AuthError) {
      redirect(`/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(sp.next && sp.next.startsWith('/') ? sp.next : '/');
  }
  const next = sp.next && sp.next.startsWith('/') ? sp.next : '/';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-teal-50 via-white to-sky-50">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white text-xl">
            🕊️
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">CPR Ops</h1>
            <p className="text-xs text-gray-500">Admin sign-in</p>
          </div>
        </div>
        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
            />
          </div>
          {sp.error === 'invalid' && (
            <div className="rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs text-red-800">
              That password didn’t work. Try again.
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-4 py-2.5 transition"
          >
            Sign in
          </button>
        </form>
        <p className="mt-4 text-[11px] text-gray-400 text-center">
          Internal ops only · sessions last 30 days
        </p>
      </div>
    </div>
  );
}
