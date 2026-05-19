'use client';

import { useEffect, useState } from 'react';

/**
 * Global error boundary. Catches any uncaught error in a server/client
 * component below the root layout.
 *
 * PR E (2026-05-18): expanded the diagnostic so we can actually debug
 * crashes Christina hits on her phone. Previously we only showed
 * `error.digest`, which is set ONLY on server-side errors — client-side
 * errors arrive with digest=undefined and the page was useless. Now we
 * also surface `error.message` (always present) behind a small "Show
 * details" disclosure, and an explicit "Copy details" button so
 * Christina can paste straight to Rafa.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Console log for browser devtools; in a real prod we'd also ship
    // to Sentry / Logflare here.
    // eslint-disable-next-line no-console
    console.error('[error.tsx]', error);
  }, [error]);

  const reportText = [
    `error id:  ${error.digest ?? '(client-side, no digest)'}`,
    `message:   ${error.message || '(no message)'}`,
    `name:      ${error.name || 'Error'}`,
    `url:       ${typeof window !== 'undefined' ? window.location.href : '(unknown)'}`,
    `ua:        ${typeof navigator !== 'undefined' ? navigator.userAgent : '(unknown)'}`,
    `time:      ${new Date().toISOString()}`,
    error.stack ? `\nstack:\n${error.stack.split('\n').slice(0, 8).join('\n')}` : '',
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available (rare on mobile Safari without HTTPS,
      // but we're on HTTPS so should be fine). Fall back to a text area
      // the user can manually copy from.
      setOpen(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-lg ring-1 ring-gray-200 p-6 text-center">
        <div className="text-4xl mb-3">🦤</div>
        <h1 className="text-xl font-bold text-gray-900">Something broke</h1>
        <p className="text-sm text-gray-600 mt-2">
          An error happened on this page. Try again, and if it keeps failing, tap
          &ldquo;Copy details&rdquo; and send them to Rafa.
        </p>

        {/* Always-visible compact summary so a non-technical user can
            still report something useful. */}
        <div className="mt-4 rounded-lg bg-gray-50 ring-1 ring-gray-200 p-3 text-left">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            What broke
          </div>
          <div className="mt-1 text-sm font-mono text-gray-800 break-words">
            {error.message || '(no message available)'}
          </div>
          {error.digest && (
            <div className="mt-2 text-[10px] font-mono text-gray-400">
              error id: {error.digest}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
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
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2"
          >
            {copied ? '✓ Copied' : 'Copy details'}
          </button>
        </div>

        {/* Disclosure: full stack + context for the times Christina is
            on a call with Rafa and he asks "what does the long version
            say?" */}
        <details className="mt-4 text-left" open={open}>
          <summary className="text-xs text-gray-500 cursor-pointer select-none">
            Show full details
          </summary>
          <pre className="mt-2 rounded-md bg-gray-900 text-gray-100 p-3 text-[10px] leading-snug overflow-x-auto whitespace-pre-wrap break-all">
            {reportText}
          </pre>
        </details>
      </div>
    </div>
  );
}
