// AssignmentCard -- one card per open assignment on the volunteer
// dashboard. Shows the urgency at a glance, the action buttons,
// and the Point Person state.

import {
  claimPointPersonAction,
  declineAction,
  figuredOutAction,
  resolveJobAction,
} from '@/app/(volunteer)/v/actions';
import type { OpenAssignment } from '@/lib/volunteer/assignments-query';
import { Siren, Truck, AlertTriangle, Check } from 'lucide-react';

function fmtDeadline(d: Date | null): string {
  if (!d) return '';
  const now = Date.now();
  const ms = d.getTime() - now;
  const min = Math.round(ms / 60000);
  if (min < 0) return `overdue ${Math.abs(min)}m`;
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr}h`;
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function urgencyTone(a: OpenAssignment): 'red' | 'orange' | 'yellow' | 'green' | 'gray' {
  if (a.emergencyFlag) return 'red';
  if (a.deadline) {
    const ms = a.deadline.getTime() - Date.now();
    if (ms < 30 * 60 * 1000) return 'red';
    if (ms < 2 * 60 * 60 * 1000) return 'orange';
    if (ms < 24 * 60 * 60 * 1000) return 'yellow';
  }
  if (a.pointPersonIsMe) return 'green';
  return 'gray';
}

const TONE_RING: Record<string, string> = {
  red: 'ring-red-300 bg-red-50/40',
  orange: 'ring-orange-300 bg-orange-50/40',
  yellow: 'ring-yellow-300 bg-yellow-50/30',
  green: 'ring-emerald-300 bg-emerald-50/30',
  gray: 'ring-gray-200 bg-white',
};

const TONE_BADGE: Record<string, string> = {
  red: 'bg-red-600 text-white',
  orange: 'bg-orange-500 text-white',
  yellow: 'bg-yellow-400 text-yellow-900',
  green: 'bg-emerald-600 text-white',
  gray: 'bg-gray-200 text-gray-700',
};

const RESOLVE_TONE: Record<string, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  yellow:  'bg-yellow-400 hover:bg-yellow-500 text-yellow-900',
  blue:    'bg-blue-600 hover:bg-blue-700 text-white',
  gray:    'bg-white hover:bg-gray-50 text-gray-700 ring-1 ring-gray-300',
};

function ResolveButton({
  jobType, jobId, resolution, label, tone,
}: {
  jobType: 'RescueCase' | 'TransportRequest';
  jobId: string;
  resolution: string;
  label: string;
  tone: 'emerald' | 'yellow' | 'blue' | 'gray';
}) {
  return (
    <form action={resolveJobAction}>
      <input type="hidden" name="jobType" value={jobType} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="resolution" value={resolution} />
      <button type="submit" className={`rounded-lg text-xs font-semibold px-3 py-1.5 ${RESOLVE_TONE[tone]}`}>
        {label}
      </button>
    </form>
  );
}

export function AssignmentCard({ a }: { a: OpenAssignment }) {
  const tone = urgencyTone(a);
  const Icon = a.jobType === 'RescueCase' ? Siren : Truck;
  const isClaimedByOther = a.pointPersonId && !a.pointPersonIsMe;

  return (
    <div className={`rounded-2xl shadow ring-1 p-4 ${TONE_RING[tone]}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}>
          {a.emergencyFlag ? <AlertTriangle size={18} /> : <Icon size={18} />}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${TONE_BADGE[tone]}`}>
              {a.emergencyFlag ? 'EMERGENCY' : a.jobType === 'RescueCase' ? 'Rescue' : 'Transport'}
            </span>
            {a.currentTier && a.currentTier > 1 && (
              <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-900 ring-1 ring-amber-200">
                Escalated · Tier {a.currentTier}
              </span>
            )}
            {a.deadline && (
              <span className="text-[11px] text-gray-700">{fmtDeadline(a.deadline)}</span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-gray-900 truncate">{a.title}</h3>
          {a.location && <p className="text-xs text-gray-600 mt-0.5 truncate">{a.location}</p>}
          {a.description && <p className="text-xs text-gray-700 mt-1 line-clamp-2">{a.description}</p>}

          {a.pointPersonIsMe && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
              <Check size={12} /> You are Point Person
            </div>
          )}
          {isClaimedByOther && (
            <div className="mt-2 text-xs text-gray-600">
              Point Person: <span className="font-semibold text-gray-800">{a.pointPersonName}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex gap-2 flex-wrap">
            {!a.pointPersonId && (
              <form action={claimPointPersonAction}>
                <input type="hidden" name="jobType" value={a.jobType} />
                <input type="hidden" name="jobId" value={a.jobId} />
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5"
                >
                  Claim Point Person
                </button>
              </form>
            )}
            {a.pointPersonIsMe && (
              <>
                {/* Resolution buttons -- the Point Person can now
                    actually CLOSE the job from inside the volunteer
                    portal, no admin-app trip required. */}
                {a.jobType === 'RescueCase' ? (
                  <>
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="rescued" label="Rescued" tone="emerald" />
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="escaped_flew_away" label="Escaped" tone="yellow" />
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="closed_unable" label="Unable" tone="gray" />
                  </>
                ) : (
                  <>
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="in_transit" label="In Transit" tone="blue" />
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="delivered" label="Delivered" tone="emerald" />
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="cancelled" label="Cancelled" tone="gray" />
                  </>
                )}
                <form action={figuredOutAction}>
                  <input type="hidden" name="jobType" value={a.jobType} />
                  <input type="hidden" name="jobId" value={a.jobId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 ring-1 ring-gray-300"
                    title="Mark figured out without resolving the case"
                  >
                    Figured Out
                  </button>
                </form>
              </>
            )}
            {!a.pointPersonId && (
              <form action={declineAction}>
                <input type="hidden" name="jobType" value={a.jobType} />
                <input type="hidden" name="jobId" value={a.jobId} />
                <button
                  type="submit"
                  className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 ring-1 ring-gray-300"
                >
                  Unavailable
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
