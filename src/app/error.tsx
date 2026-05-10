'use client';

import { useEffect } from 'react';

/**
 * Global error boundary. Catches any uncaught error in a server/client
 * component below the root layout. Keep the UI calm + recoverable.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a real prod we'd ship to Sentry / Logflare here.
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-lg ring-1 ring-gray-200 p-6 text-center">
        <div className="text-4xl mb-3">🦤</div>
        <h1 className="text-xl font-bold text-gray-900">Something broke</h1>
        <p className="text-sm text-gray-600 mt-2">
          An error happened on this page. Try again, and if it keeps failing, share
          the error id below with whoever maintains this app.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11px] font-mono text-gray-400">
            error id: {error.digest}
          </p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
