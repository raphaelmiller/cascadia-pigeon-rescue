// Coordinator approval queue. Lists every pending VolunteerEvent
// (point claims awaiting review + email-change requests + any other
// pending kind) with full context + bulk actions.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { fmtDateTime } from '@/lib/utils';
import { approvePendingAction, rejectPendingAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ApprovalQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/');

  const filter = sp.category;
  const pending = await prisma.volunteerEvent.findMany({
    where: {
      approvalStatus: 'pending',
      ...(filter ? { category: filter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { profile: { select: { name: true } } },
  });

  const groupedTotal = await prisma.volunteerEvent.groupBy({
    by: ['category'],
    where: { approvalStatus: 'pending' },
    _count: { _all: true },
  });

  return (
    <div className="space-y-4">
      <Link href="/dispatch" className="text-sm text-teal-700 hover:underline">← Dispatch board</Link>
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <h1 className="text-xl font-semibold text-gray-900">Approval queue</h1>
        <p className="text-sm text-gray-600 mt-1">
          Events that scored above the auto-approve threshold land here. Approve to bank the points; reject to discard.
        </p>
        {groupedTotal.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Link
              href="/dispatch/queue"
              className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                !filter ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({groupedTotal.reduce((s, g) => s + g._count._all, 0)})
            </Link>
            {groupedTotal.map(g => (
              <Link
                key={g.category}
                href={`/dispatch/queue?category=${g.category}`}
                className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                  filter === g.category ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {g.category} ({g._count._all})
              </Link>
            ))}
          </div>
        )}
      </div>

      {sp.msg === 'review_approved' && (
        <div className="rounded-xl ring-1 bg-emerald-50 ring-emerald-200 text-emerald-900 px-3 py-2 text-sm">
          ✅ Approved.
        </div>
      )}
      {sp.msg === 'review_rejected' && (
        <div className="rounded-xl ring-1 bg-gray-100 ring-gray-300 text-gray-800 px-3 py-2 text-sm">
          🚫 Rejected.
        </div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 text-sm text-gray-600">
          Nothing pending. All caught up.
        </div>
      ) : (
        <ul className="space-y-2">
          {pending.map(e => (
            <li key={e.id} className="rounded-xl bg-white shadow-sm ring-1 ring-violet-200 p-3 flex items-start gap-3">
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{e.profile.name}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-gray-100 text-gray-700">
                    {e.category}
                  </span>
                  {e.pointDelta !== 0 && (
                    <span className={`text-xs font-bold ${e.pointDelta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {e.pointDelta > 0 ? '+' : ''}{e.pointDelta} pts
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-gray-600">{e.kind}</p>
                {e.notes && <p className="text-xs text-gray-700 mt-1">{e.notes}</p>}
                {e.refType && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Ref: {e.refType} / {e.refId}
                  </p>
                )}
                <p className="text-[11px] text-gray-500 mt-0.5">{fmtDateTime(e.createdAt)}</p>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-1">
                <form action={approvePendingAction}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1">
                    Approve
                  </button>
                </form>
                <form action={rejectPendingAction}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <button type="submit" className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1 ring-1 ring-gray-300">
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
