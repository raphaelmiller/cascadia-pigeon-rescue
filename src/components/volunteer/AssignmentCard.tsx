// AssignmentCard -- one card per open assignment on the volunteer
// dashboard.
//
// PR I (2026-05-24): rewrite. Every paged volunteer can tap into the
// case, not just the Point Person. Three layered roles:
//
//   1. Visibility (always): tappable card → full case detail. Status
//      pill shows "Theo's got it · claimed 12m ago" or heartbeat warning.
//   2. Soft engagement (non-PP): "I can back up" button toggles standby
//      state; case page lets them add notes/photos.
//   3. Take-over (non-PP, conditional): once the PP has been idle past
//      the threshold (10 min emergency / 20 min routine), the
//      "Take over" button activates on follower cards.
//
// The intent is to fight the "Theo's got it, I don't need to show up"
// trap that Rafa flagged 2026-05-24.

import Link from 'next/link';
import {
  claimPointPersonAction,
  declineAction,
  figuredOutAction,
  resolveJobAction,
  toggleStandbyAction,
  takeoverAction,
} from '@/app/(volunteer)/v/actions';
import type { OpenAssignment } from '@/lib/volunteer/assignments-query';
import {
  Siren, Truck, AlertTriangle, Check, FileText, ChevronRight,
  UserPlus, Heart, Users,
} from 'lucide-react';

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

function fmtRel(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
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
  const claimedByOther = !!a.pointPersonId && !a.pointPersonIsMe;
  const detailHref = a.jobType === 'RescueCase' ? `/rescue/case/${a.jobId}` : `/transport`;

  // Build the status line that explains who's leading + how recently.
  const claimedAgo = a.pointPersonClaimedAt ? fmtRel(Date.now() - a.pointPersonClaimedAt.getTime()) : null;
  const idleLine = a.idleMs !== null
    ? a.idleMs >= 30 * 60 * 1000 ? `⚠ silent ${fmtRel(a.idleMs)}`
    : `last update ${fmtRel(a.idleMs)}`
    : null;

  return (
    <div className={`rounded-2xl shadow ring-1 p-4 ${TONE_RING[tone]}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}>
          {a.emergencyFlag ? <AlertTriangle size={18} /> : <Icon size={18} />}
        </div>
        <div className="flex-grow min-w-0">
          {/* Tappable header → case page */}
          <Link href={detailHref} className="block group">
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
              <ChevronRight size={14} className="text-gray-400 ml-auto group-hover:text-gray-700 transition" />
            </div>
            <h3 className="mt-1 text-sm font-semibold text-gray-900 truncate group-hover:underline">{a.title}</h3>
            {a.location && <p className="text-xs text-gray-600 mt-0.5 truncate">📍 {a.location}</p>}
            {a.description && <p className="text-xs text-gray-700 mt-1 line-clamp-2">{a.description}</p>}
          </Link>

          {/* "Who's leading" status line */}
          {a.pointPersonIsMe && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
              <Check size={12} /> You are Point Person
            </div>
          )}
          {claimedByOther && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs text-emerald-900 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <strong>{a.pointPersonName}</strong> is leading
              </span>
              {claimedAgo && (
                <span className="text-[11px] text-gray-500">· claimed {claimedAgo}</span>
              )}
              {idleLine && (
                <span className={`text-[11px] ${a.idleMs && a.idleMs >= 30 * 60 * 1000 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                  · {idleLine}
                </span>
              )}
              {a.followerCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-700 bg-gray-100 ring-1 ring-gray-200 rounded-full px-2 py-0.5">
                  <Users size={10} /> {a.followerCount} on standby
                </span>
              )}
            </div>
          )}
          {!a.pointPersonId && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 ring-1 ring-amber-200 rounded-full px-2 py-0.5">
              <AlertTriangle size={12} /> No one has claimed this yet
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex gap-2 flex-wrap">
            {/* No PP claimed yet → primary claim CTA */}
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

            {/* You ARE the PP → resolution buttons */}
            {a.pointPersonIsMe && (
              <>
                {a.jobType === 'RescueCase' ? (
                  <>
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="rescued" label="Rescued" tone="emerald" />
                    <ResolveButton jobType={a.jobType} jobId={a.jobId} resolution="escaped_flew_away" label="Escaped" tone="yellow" />
                    <Link
                      href={`/rescue/case/${a.jobId}#unable`}
                      className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 ring-1 ring-gray-300"
                      title="Couldn't rescue — pass to next volunteer"
                    >
                      Unable — pass on
                    </Link>
                    <Link
                      href={`/rescue/case/${a.jobId}#notes`}
                      className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 ring-1 ring-gray-300"
                      title="Add field notes / photos"
                    >
                      <FileText size={12} /> Notes & photos
                    </Link>
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

            {/* PP claimed BUT not you → standby + (conditional) take-over + view */}
            {claimedByOther && (
              <>
                <form action={toggleStandbyAction}>
                  <input type="hidden" name="jobType" value={a.jobType} />
                  <input type="hidden" name="jobId" value={a.jobId} />
                  <input type="hidden" name="standby" value={a.iAmOnStandby ? '0' : '1'} />
                  <button
                    type="submit"
                    className={`inline-flex items-center gap-1 rounded-lg text-xs font-semibold px-3 py-1.5 ${
                      a.iAmOnStandby
                        ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 ring-1 ring-emerald-300'
                        : 'bg-white hover:bg-gray-50 text-gray-700 ring-1 ring-gray-300'
                    }`}
                    title={a.iAmOnStandby ? "Tap to clear standby" : `Back up ${a.pointPersonName ?? 'the lead'}`}
                  >
                    <Heart size={12} className={a.iAmOnStandby ? 'fill-emerald-700' : ''} />
                    {a.iAmOnStandby ? 'Standing by ✓' : `Back up ${a.pointPersonName?.split(' ')[0] ?? 'lead'}`}
                  </button>
                </form>

                {a.takeoverUnlocked && (
                  <form action={takeoverAction}>
                    <input type="hidden" name="jobId" value={a.jobId} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5"
                      title={`${a.pointPersonName ?? 'Lead'} has been silent — take over as Point Person`}
                    >
                      <UserPlus size={12} /> Take over
                    </button>
                  </form>
                )}

                <Link
                  href={detailHref}
                  className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 ring-1 ring-gray-300"
                >
                  Open case <ChevronRight size={12} />
                </Link>
              </>
            )}

            {/* Decline / Unavailable — only when no PP yet, so it doesn't read
                as "I'm bailing on a teammate" once someone has claimed. */}
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
