import { requireVolunteer } from '@/lib/volunteer/auth';
import { ROLE_LABELS, activitiesFor, type RoleTag } from '@/lib/volunteer/roles';
import { totalPoints } from '@/lib/volunteer/events';
import { getOpenAssignmentsFor } from '@/lib/volunteer/assignments-query';
import { AssignmentCard } from '@/components/volunteer/AssignmentCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function VolunteerHome({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireVolunteer();
  const activities = new Set(activitiesFor(v.roleTags.join(',')));
  const points = await totalPoints(v.profileId);
  const assignments = await getOpenAssignmentsFor(v.profileId);
  // Render the coordinator chip from the dedicated badge only -- avoid the
  // duplicate that the role-tag list otherwise produces when 'coordinator'
  // is in the tag set. (QA H1.)
  const displayedTags = v.roleTags.filter(t => t !== 'coordinator');

  return (
    <div className="space-y-4">
      {sp.msg && <MessageBanner msg={sp.msg} />}

      {/* Identity card */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <p className="text-xs uppercase tracking-wide text-gray-500">Signed in as</p>
        <h1 className="text-xl font-semibold text-gray-900">{v.name}</h1>
        <p className="text-sm text-gray-600 mt-0.5">{v.email}</p>
        {(displayedTags.length > 0 || v.isCoordinator) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {displayedTags.map((t: RoleTag) => (
              <span key={t} className="text-[11px] rounded-full px-2 py-0.5 bg-teal-50 text-teal-800 ring-1 ring-teal-200">
                {ROLE_LABELS[t]}
              </span>
            ))}
            {v.isCoordinator && (
              <span className="text-[11px] rounded-full px-2 py-0.5 bg-violet-50 text-violet-800 ring-1 ring-violet-200">
                Coordinator
              </span>
            )}
          </div>
        )}
        {points > 0 && (
          <div className="mt-3 text-xs text-gray-500">
            Service record: <strong className="text-gray-800">{points}</strong> pts banked
          </div>
        )}
      </div>

      {/* Active assignments -- the heart of Phase 1 */}
      {assignments.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
            Awaiting your action ({assignments.length})
          </h2>
          <div className="space-y-3">
            {assignments.map(a => (
              <AssignmentCard key={a.assignmentId} a={a} />
            ))}
          </div>
        </div>
      )}

      {/* Activity sections (kept for context, but now they're below
          assignments since assignments are the priority signal) */}
      {assignments.length === 0 && (
        <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
          <p className="text-sm text-gray-600">
            Nothing on your plate right now.{' '}
            {activities.size > 0 && (
              <>You&apos;ll be notified when a job comes up that matches your roles and availability.</>
            )}
          </p>
        </div>
      )}

      {activities.has('rescue') && (
        <Card title="🚨 Rescue">
          <p className="text-sm text-gray-600">
            Open rescue cases and your full history.
          </p>
          <Link href="/rescue" className="text-sm text-teal-700 hover:underline">View rescue →</Link>
        </Card>
      )}
      {activities.has('transport') && (
        <Card title="🚚 Transport">
          <p className="text-sm text-gray-600">
            Your transport history and available pickups.
          </p>
          <Link href="/transport" className="text-sm text-teal-700 hover:underline">View transport →</Link>
        </Card>
      )}
      {activities.has('foster') && (
        <Card title="🐦 My Birds">
          <p className="text-sm text-gray-600">
            Birds in your care + daily check-ins.
          </p>
          <Link href="/birds" className="text-sm text-teal-700 hover:underline">View my birds →</Link>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const RESOLUTION_LABELS: Record<string, string> = {
  rescued: 'Marked rescued',
  escaped_flew_away: 'Marked escaped',
  closed_unable: 'Closed as unable',
  in_transit: 'Marked in transit',
  delivered: 'Marked delivered',
  cancelled: 'Cancelled',
};

function MessageBanner({ msg }: { msg: string }) {
  let text: string | null = null;
  if (msg === 'claimed') text = '✅ Claimed. You are now Point Person.';
  else if (msg === 'declined') text = '👋 Marked unavailable.';
  else if (msg === 'figured_out') text = '✅ Marked figured out. Escalations closed.';
  else if (msg.startsWith('resolved:')) {
    const [, status, ptsStr] = msg.split(':');
    const label = RESOLUTION_LABELS[status] ?? `Resolved → ${status}`;
    const pts = Number(ptsStr);
    text = pts > 0 ? `✅ ${label}. +${pts} pts banked.` : `✅ ${label}.`;
  }
  else if (msg.startsWith('claim_failed:already_claimed')) text = '⚠️ Another volunteer claimed it first.';
  else if (msg.startsWith('claim_failed:not_eligible')) text = '⚠️ You\'re not assigned to that job.';
  else if (msg.startsWith('claim_failed:job_resolved')) text = '⚠️ Job already resolved.';
  else if (msg === 'not_point_person') text = '⚠️ Only the Point Person can resolve a job.';
  else if (msg.startsWith('resolve_failed:')) text = '⚠️ Resolve failed: ' + msg.slice('resolve_failed:'.length);
  if (!text) return null;
  const ok = !text.startsWith('⚠');
  const tone = ok ? 'bg-emerald-50 ring-emerald-200 text-emerald-900' : 'bg-amber-50 ring-amber-200 text-amber-900';
  return (
    <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${tone}`}>
      {text}
    </div>
  );
}
