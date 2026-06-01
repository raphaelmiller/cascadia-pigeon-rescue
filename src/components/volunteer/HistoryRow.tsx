// HistoryRow -- compact row used by /v/transport and /v/rescue list
// pages. Quieter than AssignmentCard (which is the bright dashboard
// version). Same data shape; different render style.

import {
  claimPointPersonAction,
  declineAction,
  figuredOutAction,
  undoDeclineAction,
} from '@/app/(volunteer)/v/actions';
import type { HistoryItem } from '@/lib/volunteer/assignment-history';
import { AlertTriangle, Check, Clock, RotateCcw } from 'lucide-react';
import { StatusRailCard, type StatusRailTone } from './StatusRailCard';

// PR K (2026-05-31): tone the active row by status so it picks up a left
// rail. Recent rows are quieter (no rail) so the page reads as
// "current ops at top, historical record below".
function activeRowTone(item: HistoryItem): StatusRailTone {
  if (item.emergencyFlag) return 'emergency';
  if (item.pointPersonIsMe) return 'assigned';
  if (item.deadline) {
    const ms = item.deadline.getTime() - Date.now();
    if (ms < 30 * 60 * 1000) return 'emergency';
    if (ms < 2 * 60 * 60 * 1000) return 'warning';
  }
  return 'rescue';
}

function activeRowLabel(item: HistoryItem, tone: StatusRailTone): string {
  if (tone === 'emergency') return 'EMERGENCY';
  if (tone === 'assigned') {
    return item.jobType === 'RescueCase' ? 'RESCUE\u00a0ASSIGNED' : 'TRANSPORT\u00a0ASSIGNED';
  }
  if (tone === 'warning') return 'TIME\u00a0SENSITIVE';
  return item.jobType === 'RescueCase' ? 'RESCUE' : 'TRANSPORT';
}

function fmtDeadline(d: Date | null): string {
  if (!d) return '';
  const ms = d.getTime() - Date.now();
  const min = Math.round(ms / 60000);
  if (min < 0) return `overdue ${Math.abs(min)}m`;
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr}h`;
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtWhen(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const JOB_STATUS_LABEL: Record<string, string> = {
  // rescue
  needs_rescue: '🚨 Needs rescue',
  rescued: '✅ Rescued',
  escaped_flew_away: '💨 Escaped',
  closed_unable: '❌ Closed',
  // transport
  open: 'Open',
  assigned: 'Assigned',
  in_transit: 'In transit',
  delivered: '✅ Delivered',
  cancelled: 'Cancelled',
};

function statusBadgeTone(status: string): string {
  if (['rescued', 'delivered'].includes(status)) return 'bg-emerald-100 text-emerald-900';
  if (['escaped_flew_away', 'in_transit'].includes(status)) return 'bg-blue-100 text-blue-900';
  if (['closed_unable', 'cancelled'].includes(status)) return 'bg-gray-100 text-gray-700';
  if (status === 'needs_rescue') return 'bg-red-100 text-red-900';
  return 'bg-yellow-100 text-yellow-900';
}

export function HistoryRow({ item, kind }: { item: HistoryItem; kind: 'active' | 'recent' }) {
  const showActions = kind === 'active';
  const showActionBar = showActions && (
    !item.pointPersonId || item.pointPersonIsMe
  );

  // Active rows get the status rail + tinted body. Recent rows stay quiet.
  if (kind === 'active') {
    const tone = activeRowTone(item);
    const label = activeRowLabel(item, tone);
    return (
      <li>
        <StatusRailCard tone={tone} label={label} className="space-y-2">
          <HistoryRowContent item={item} kind={kind} showActionBar={showActionBar} />
        </StatusRailCard>
      </li>
    );
  }

  return (
    <li className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-3 space-y-2">
      <HistoryRowContent item={item} kind={kind} showActionBar={showActionBar} />
    </li>
  );
}

// Extracted body so both the rail-wrapped (active) and quieter (recent)
// variants share one render path. Keeps any future content edits in one place.
function HistoryRowContent({
  item, kind, showActionBar,
}: {
  item: HistoryItem;
  kind: 'active' | 'recent';
  showActionBar: boolean;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.emergencyFlag && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-red-600 text-white">
                <AlertTriangle size={10} /> Emergency
              </span>
            )}
            {item.currentTier && item.currentTier > 1 && (
              <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-900">
                Escalated · T{item.currentTier}
              </span>
            )}
            <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 ${statusBadgeTone(item.jobStatus)}`}>
              {JOB_STATUS_LABEL[item.jobStatus] ?? item.jobStatus}
            </span>
            {item.deadline && !item.resolved && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <Clock size={11} /> {fmtDeadline(item.deadline)}
              </span>
            )}
          </div>

          <h3 className="mt-1 text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
          {item.location && <p className="text-xs text-gray-600 truncate">{item.location}</p>}
          {item.description && (
            <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{item.description}</p>
          )}

          {/* Role markers */}
          {item.pointPersonIsMe && !item.resolved && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
              <Check size={11} /> You are Point Person
            </div>
          )}
          {item.pointPersonId && !item.pointPersonIsMe && (
            <p className="mt-1 text-[11px] text-gray-600">
              Point Person: <span className="font-medium text-gray-800">{item.pointPersonName}</span>
            </p>
          )}
          {item.status === 'declined' && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <p className="text-[11px] text-gray-500 italic">
                You marked unavailable {fmtWhen(item.declinedAt)}
              </p>
              {/* Christina feedback (2026-05-25): every action should be
                  reversible. Un-decline puts the volunteer back in the
                  pool for this specific job. Only renders while the job
                  is still active (not resolved). */}
              {!item.resolved && (
                <form action={undoDeclineAction}>
                  <input type="hidden" name="jobType" value={item.jobType} />
                  <input type="hidden" name="jobId" value={item.jobId} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-full bg-white hover:bg-gray-50 text-gray-700 text-[11px] font-medium px-3 py-0.5 ring-1 ring-gray-300"
                    title="Pressed Unavailable by accident? Tap to re-join the pool for this job."
                  >
                    <RotateCcw size={10} /> Un-decline
                  </button>
                </form>
              )}
            </div>
          )}
          {kind === 'recent' && item.pointPersonIsMe && (
            <p className="mt-1 text-[11px] text-emerald-700">
              You were Point Person · finished {fmtWhen(item.figuredOutAt ?? item.claimedAt)}
            </p>
          )}
        </div>
      </div>

      {showActionBar && (
        <div className="flex gap-2 flex-wrap pt-1">
          {!item.pointPersonId && (
            <>
              <form action={claimPointPersonAction}>
                <input type="hidden" name="jobType" value={item.jobType} />
                <input type="hidden" name="jobId" value={item.jobId} />
                <button type="submit" className="rounded-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-1.5">
                  Claim Point Person
                </button>
              </form>
              <form action={declineAction}>
                <input type="hidden" name="jobType" value={item.jobType} />
                <input type="hidden" name="jobId" value={item.jobId} />
                <button type="submit" className="rounded-full bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-4 py-1.5 ring-1 ring-gray-300">
                  Unavailable
                </button>
              </form>
            </>
          )}
          {item.pointPersonIsMe && (
            <form action={figuredOutAction}>
              <input type="hidden" name="jobType" value={item.jobType} />
              <input type="hidden" name="jobId" value={item.jobId} />
              <button
                type="submit"
                className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-1.5"
                title="Mark as Handled — use when the situation was sorted outside the app. Stops the fan-out without resolving the case."
              >
                Mark as Handled <span className="ml-1 text-[10px] opacity-80 font-normal">(Figured Out)</span>
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
