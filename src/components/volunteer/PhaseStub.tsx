// Generic placeholder for volunteer-portal routes that exist in the
// navigation but whose real implementation ships in a later phase.
// Better than a 404 because:
//   1. It confirms the volunteer is in the right place.
//   2. It sets expectations ("Coming in Phase 1").
//   3. It renders the volunteer chrome -- no admin-leak via the 404 path.

import Link from 'next/link';

export function PhaseStub({
  icon,
  title,
  phase = 'Phase 1',
  description,
}: {
  icon: string;
  title: string;
  phase?: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-6 text-center">
        <p className="text-5xl mb-3">{icon}</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">{title}</h1>
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 ring-1 ring-amber-200 mb-3">
          Coming in {phase}
        </span>
        <p className="text-sm text-gray-600 max-w-md mx-auto">{description}</p>
      </div>
      <p className="text-center">
        <Link href="/" className="text-sm text-teal-700 hover:underline">
          ← Back to your home
        </Link>
      </p>
    </div>
  );
}
