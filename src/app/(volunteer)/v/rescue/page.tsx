// Volunteer's Rescue assignments list. Same shape as /v/transport,
// scoped to RescueCase.

import { requireAnyRole } from '@/lib/volunteer/auth';
import { getAssignmentHistory } from '@/lib/volunteer/assignment-history';
import { HistoryRow } from '@/components/volunteer/HistoryRow';
import { Siren } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function VolunteerRescuePage() {
  const v = await requireAnyRole(['rescue', 'rescue_lead']);
  const { active, recent, archiveCount } = await getAssignmentHistory(v.profileId, 'RescueCase');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <div className="flex items-center gap-3">
          <Siren size={22} className="text-red-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Rescue</h1>
            <p className="text-sm text-gray-600">
              Open cases assigned to you, plus your history. Emergencies fire to coordinators + Christina simultaneously.
            </p>
          </div>
        </div>
      </div>

      <Section title={`Active (${active.length})`} subtitle="Click on a job for more info" empty="No active rescue assignments right now.">
        {active.length > 0 && active.map(it => (
          <HistoryRow key={it.assignmentId} item={it} kind="active" />
        ))}
      </Section>

      {(recent.length > 0 || archiveCount > 0) && (
        <Section title={`Recent (${recent.length})`} subtitle="Tap to expand" empty="No rescue history yet.">
          {recent.map(it => (
            <HistoryRow key={it.assignmentId} item={it} kind="recent" />
          ))}
        </Section>
      )}

      {archiveCount > 0 && (
        <p className="text-xs text-gray-500 text-center pt-2">
          + {archiveCount} older {archiveCount === 1 ? 'assignment' : 'assignments'} in your archive
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
  subtitle,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
  subtitle?: string;
}) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
  return (
    <div>
      {/* PR K: centered, all-caps, low-contrast section label —
          matches the operations-console pattern (label, not headline).
          PR L: optional structural subtitle in the same all-caps language. */}
      <h2 className="cpr-section-header text-center mb-1.5 mt-2">
        {title}
      </h2>
      {subtitle && (
        <p className="cpr-section-subtitle text-center mb-3">{subtitle}</p>
      )}
      {!subtitle && <div className="mb-3" aria-hidden="true" />}
      {childCount === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-4 text-sm text-gray-600">
          {empty}
        </div>
      ) : (
        <ul className="space-y-3">{children}</ul>
      )}
    </div>
  );
}
