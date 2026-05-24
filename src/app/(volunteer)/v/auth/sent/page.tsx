// Volunteer-portal "check your inbox" page. Reached after submitting
// the /login form (regardless of whether the email exists \u2014 no
// enumeration). Tells the user to check email + warns about stub mode
// when relevant.

import { emailModeLabel } from '@/lib/notify/email';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MagicLinkSentPage() {
  const mode = emailModeLabel();
  const isStub = mode.startsWith('Stub');
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 p-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-2xl mb-3">
          📩
        </span>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Check your email</h1>
        <p className="text-sm text-gray-600">
          If we have a volunteer account for that email, a sign-in link is on
          its way. It expires in 30 minutes.
        </p>
        {isStub && (
          <div className="mt-4 rounded-lg bg-yellow-50 ring-1 ring-yellow-200 px-3 py-2 text-[11px] text-yellow-900 text-left">
            <strong>Dev note:</strong> email delivery is in stub mode. The
            magic-link URL is logged to the server console and to{' '}
            <code className="mx-1 px-1 rounded bg-yellow-100">uploads/_outbox/email.log</code>.
            {' '}
            Set <code>RESEND_API_KEY</code> to flip into live mode.
          </div>
        )}
        <p className="mt-5 text-[11px] text-gray-400">
          <Link href="/login" className="underline">Use a different email</Link>
        </p>
      </div>
    </div>
  );
}
