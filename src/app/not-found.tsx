import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-lg ring-1 ring-gray-200 p-6 text-center">
        <div className="text-4xl mb-3">🕊️</div>
        <h1 className="text-xl font-bold text-gray-900">Not found</h1>
        <p className="text-sm text-gray-600 mt-2">
          That page or record doesn’t exist — it may have been archived or deleted.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2"
          >
            Go home
          </Link>
          <Link
            href="/birds"
            className="inline-flex items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2"
          >
            Birds list
          </Link>
        </div>
      </div>
    </div>
  );
}
