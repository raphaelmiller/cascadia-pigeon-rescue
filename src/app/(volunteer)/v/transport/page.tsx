// Volunteer's Transport assignments list. Same shape as /v/rescue,
// scoped to TransportRequest.

import { requireAnyRole } from '@/lib/volunteer/auth';
import { getAssignmentHistory } from '@/lib/volunteer/assignment-history';
import { HistoryRow } from '@/components/volunteer/HistoryRow';
import { Truck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function VolunteerTransportPage() {
  const v = await requireAnyRole(['transport']);
  const { active, recent, archiveCount } = await getAssignmentHistory(v.profileId, 'TransportRequest');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <div className="flex items-center gap-3">
          <Truck size={22} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Transport</h1>
            <p className="text-sm text-gray-600">
              Your assigned pickups + delivery history. Claim a job to become Point Person.
            </p>
          </div>
        </div>
      </div>

      <Section title={`Active (${active.length})`} empty="No active transport jobs right now.">
        {active.length > 0 && active.map(it => (
          <HistoryRow key={it.assignmentId} item={it} kind="active" />
        ))}
      </Section>

      {(recent.length > 0 || archiveCount > 0) && (
        <Section title={`Recent (${recent.length})`} empty="No transport history yet.">
          {recent.map(it => (
            <HistoryRow key={it.assignmentId} item={it} kind="recent" />
          ))}
        </Section>
      )}

      {archiveCount > 0 && (
        <p className="text-xs text-gray-500 text-center pt-2">
          + {archiveCount} older {archiveCount === 1 ? 'job' : 'jobs'} in your archive
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
        {title}
      </h2>
      {childCount === 0 ? (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 p-4 text-sm text-gray-600">
          {empty}
        </div>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </div>
  );
}
