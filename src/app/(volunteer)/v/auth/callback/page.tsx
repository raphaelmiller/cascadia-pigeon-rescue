// Magic-link callback. URL: /auth/callback?t=<raw-token>
//
// We can't call signIn() from a Server Component (it needs to set cookies
// via a server action). So this page renders a tiny client form that
// auto-submits to the action, which in turn invokes next-auth signIn()
// with provider='volunteer-token'. That issues the JWT cookie and
// redirects to the originally-requested path.

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createHash } from 'node:crypto';
import { signIn } from '@/auth';

export const dynamic = 'force-dynamic';

async function completeSignInAction(formData: FormData) {
  'use server';
  const raw = String(formData.get('t') ?? '');
  if (!raw) redirect('/login?error=invalid');
  try {
    await signIn('volunteer-token', {
      token: raw,
      redirectTo: String(formData.get('next') ?? '/') || '/',
    });
  } catch (err) {
    // next-auth throws NEXT_REDIRECT on success; let it propagate.
    const e = err as { digest?: string };
    if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_REDIRECT')) {
      throw err;
    }
    redirect('/login?error=invalid');
  }
}

export default async function MagicLinkCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const raw = (sp.t ?? '').trim();
  if (!raw) redirect('/login?error=invalid');

  // Pre-flight check: look up the magic link to surface a nicer error
  // than "invalid" when it's specifically expired or already used. We
  // do NOT consume here \u2014 consumption happens inside the next-auth
  // authorize() callback when the form below posts.
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const link = await prisma.volunteerMagicLink.findUnique({
    where: { tokenHash },
    select: { redirectTo: true, expiresAt: true, consumedAt: true, profile: { select: { disabledAt: true } } },
  });
  if (!link) redirect('/login?error=invalid');
  if (link.consumedAt) redirect('/login?error=used');
  if (link.expiresAt < new Date()) redirect('/login?error=expired');
  if (link.profile.disabledAt) redirect('/login?error=disabled');

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <form action={completeSignInAction} className="text-center">
        <input type="hidden" name="t" value={raw} />
        <input type="hidden" name="next" value={link.redirectTo} />
        <p className="text-sm text-gray-600 mb-4">Signing you in…</p>
        <button
          type="submit"
          className="rounded-full bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-4 py-2.5"
          autoFocus
        >
          Continue
        </button>
        <noscript>
          <p className="mt-2 text-xs text-gray-500">
            JavaScript is required to auto-submit. Click Continue to finish.
          </p>
        </noscript>
        <ClientAutoSubmit />
      </form>
    </div>
  );
}

// Client island that submits the parent form on mount. Lives in this
// file as a server-component-side tiny shim, but renders a small
// `<script>` to perform the submit. We avoid 'use client' here so the
// page stays mostly server-rendered.
function ClientAutoSubmit() {
  // We render a no-op span and rely on the inline script below.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "document.currentScript.previousElementSibling && " +
          "setTimeout(function(){var f=document.querySelector('form');if(f) f.requestSubmit && f.requestSubmit();}, 50);",
      }}
    />
  );
}
