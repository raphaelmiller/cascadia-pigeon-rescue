// Volunteer-portal 404. Renders inside the volunteer root layout so
// the admin chrome NEVER leaks onto a not-found page on the volunteer
// host.

import Link from 'next/link';

export default function VolunteerNotFound() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-3">🐦</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Page not found
        </h1>
        <p className="text-sm text-gray-600 mb-5">
          That page doesn&apos;t exist (yet). The portal is being built out
          in phases.
        </p>
        <Link
          href="/"
          className="inline-block rounded-full bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-4 py-2.5 transition"
        >
          Back to your home
        </Link>
      </div>
    </div>
  );
}
