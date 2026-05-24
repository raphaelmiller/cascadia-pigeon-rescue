// Coordinator dispatch board. Shows every open job with tier indicator,
// claim state, counts, and coordinator action buttons.

import { redirect } from 'next/navigation';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { getDispatchBoard, type BoardJob } from '@/lib/volunteer/dispatch-board';
import { getPendingReviews, type PendingReview } from '@/lib/volunteer/pending-reviews';
import { redispatchAction, manualClaimAction, forceEscalateAction, approvePendingAction, rejectPendingAction } from './actions';
import { SystemStatusBanner } from '@/components/volunteer/SystemStatusBanner';
import { Siren, Truck, AlertTriangle, Clock, RefreshCw, FastForward, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

function fmtRel(d: Date | null): string {
  if (!d) return '';
  const ms = d.getTime() - Date.now();
  const min = Math.round(ms / 60000);
  if (min < 0) return `${Math.abs(min)}m ago`;
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr}h`;
  return d.toLocaleDateString();
}

function tierTone(j: BoardJob): string {
  if (j.emergencyFlag) return 'border-red-500 bg-red-50';
  if (j.currentTier === 3) return 'border-red-400 bg-red-50';
  if (j.currentTier === 2) return 'border-orange-400 bg-orange-50';
  if (j.pointPersonName) return 'border-emerald-300 bg-emerald-50';
  return 'border-yellow-300 bg-yellow-50';
}

function tierLabel(j: BoardJob): string {
  if (j.pointPersonName) return `Point Person: ${j.pointPersonName}`;
  if (j.currentTier === 1) return `T1 · volunteers · ${j.notifiedCount} notified`;
  if (j.currentTier === 2) return `T2 · coordinators · ${j.notifiedCount} declined`;
  if (j.currentTier === 3) return `T3 · Christina · escalated`;
  return 'Unassigned';
}

const MSG: Record<string, { text: string; ok: boolean }> = {
  redispatched:    { text: '✅ Re-dispatched. Candidates refreshed.', ok: true },
  manual_claimed:  { text: '✅ Manually assigned Point Person.', ok: true },
  forbidden:       { text: '⚠️ Coordinator-only action.', ok: false },
  invalid_target:  { text: '⚠️ Pick a volunteer first.', ok: false },
  already_max_tier:{ text: '⚠️ Already at tier 3.', ok: false },
  review_approved: { text: '✅ Request approved.', ok: true },
  review_rejected: { text: '🚫 Request rejected.', ok: true },
  review_already_handled: { text: '⚠️ Review already handled.', ok: false },
  email_in_use:    { text: '⚠️ That email is already in use.', ok: false },
};

export default async function DispatchBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/');

  const [jobs, pending] = await Promise.all([
    getDispatchBoard(),
    getPendingReviews(),
  ]);
  const emergencies = jobs.filter(j => j.emergencyFlag);
  const escalated   = jobs.filter(j => !j.emergencyFlag && (j.currentTier ?? 0) >= 2);
  const open        = jobs.filter(j => !j.emergencyFlag && (j.currentTier ?? 0) < 2);

  let msgRender: React.ReactNode = null;
  if (sp.msg) {
    let info = MSG[sp.msg];
    if (!info) {
      if (sp.msg.startsWith('escalated:')) {
        const t = sp.msg.split(':')[1];
        info = { text: `✅ Force-escalated to tier ${t}.`, ok: true };
      } else if (sp.msg.startsWith('manual_claim_failed:')) {
        const r = sp.msg.split(':')[1];
        info = { text: `⚠️ Manual claim failed: ${r}`, ok: false };
      }
    }
    if (info) {
      msgRender = (
        <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${info.ok ? 'bg-emerald-50 ring-emerald-200 text-emerald-900' : 'bg-amber-50 ring-amber-200 text-amber-900'}`}>
          {info.text}
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      {msgRender}
      <SystemStatusBanner />
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <h1 className="text-xl font-semibold text-gray-900">Dispatch Board</h1>
        <p className="text-sm text-gray-600 mt-1">
          {jobs.length === 0
            ? 'All quiet. No open jobs.'
            : `${jobs.length} open job${jobs.length === 1 ? '' : 's'}. ${emergencies.length} emergency · ${escalated.length} escalated · ${open.length} routine.`}
        </p>
      </div>

      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-700 flex items-center gap-1">
              <Inbox size={14} /> Pending review ({pending.length})
            </h2>
            <a href="/dispatch/queue" className="text-xs text-teal-700 hover:underline">
              Full queue →
            </a>
          </div>
          <ul className="space-y-2">
            {pending.slice(0, 5).map(r => <PendingRow key={r.eventId} r={r} />)}
          </ul>
        </div>
      )}

      {emergencies.length > 0 && (
        <Section title="🚨 EMERGENCY" tone="red">
          {emergencies.map(j => <BoardCard key={j.jobId} j={j} />)}
        </Section>
      )}
      {escalated.length > 0 && (
        <Section title="⚠️ Escalated" tone="orange">
          {escalated.map(j => <BoardCard key={j.jobId} j={j} />)}
        </Section>
      )}
      {open.length > 0 && (
        <Section title="Open jobs" tone="gray">
          {open.map(j => <BoardCard key={j.jobId} j={j} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PendingRow({ r }: { r: PendingReview }) {
  return (
    <li className="rounded-xl bg-white shadow-sm ring-1 ring-violet-200 px-3 py-2 flex items-start gap-3">
      <div className="flex-grow min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          {r.profileName}
        </p>
        <p className="text-xs text-gray-700 truncate">
          {r.actionLabel}{r.notes ? `: ${r.notes}` : ''}
        </p>
        <p className="text-[11px] text-gray-500">{r.createdAt.toLocaleString()}</p>
      </div>
      <div className="flex-shrink-0 flex gap-1">
        <form action={approvePendingAction}>
          <input type="hidden" name="eventId" value={r.eventId} />
          <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1">
            Approve
          </button>
        </form>
        <form action={rejectPendingAction}>
          <input type="hidden" name="eventId" value={r.eventId} />
          <button type="submit" className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-2.5 py-1 ring-1 ring-gray-300">
            Reject
          </button>
        </form>
      </div>
    </li>
  );
}

function BoardCard({ j }: { j: BoardJob }) {
  const Icon = j.jobType === 'RescueCase' ? Siren : Truck;
  const claimable = j.candidates.filter(c => c.status !== 'declined');
  const claimed = !!j.pointPersonId;

  return (
    <div className={`rounded-xl border-l-4 ${tierTone(j)} ring-1 ring-gray-200 px-3 py-3 space-y-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {j.emergencyFlag ? <AlertTriangle size={18} className="text-red-600" /> : <Icon size={18} className="text-gray-600" />}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-700">
              {j.jobType === 'RescueCase' ? 'Rescue' : 'Transport'}
            </span>
            {j.emergencyFlag && (
              <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-red-600 text-white">
                EMERGENCY
              </span>
            )}
            {j.deadline && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-700">
                <Clock size={11} /> {fmtRel(j.deadline)}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">{j.title}</p>
          {j.location && <p className="text-xs text-gray-600 truncate">{j.location}</p>}
          <p className="text-xs text-gray-700 mt-1">{tierLabel(j)}</p>
          {j.tierExpiresAt && !claimed && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              Tier expires {fmtRel(j.tierExpiresAt)}
            </p>
          )}
          {j.candidates.length > 0 && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {j.candidates.length} candidate{j.candidates.length === 1 ? '' : 's'} · {j.candidates.filter(c => c.status === 'declined').length} declined
            </p>
          )}
        </div>
      </div>

      {/* Coordinator action bar */}
      {!claimed && (
        <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-100">
          {claimable.length > 0 && (
            <form action={manualClaimAction} className="flex gap-1">
              <input type="hidden" name="jobType" value={j.jobType} />
              <input type="hidden" name="jobId" value={j.jobId} />
              <select name="targetProfileId" defaultValue="" className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs">
                <option value="" disabled>Claim on behalf of…</option>
                {claimable.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1">
                Assign
              </button>
            </form>
          )}
          <form action={redispatchAction}>
            <input type="hidden" name="jobType" value={j.jobType} />
            <input type="hidden" name="jobId" value={j.jobId} />
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-2.5 py-1 ring-1 ring-gray-300">
              <RefreshCw size={11} /> Re-dispatch
            </button>
          </form>
          {(j.currentTier ?? 0) > 0 && (j.currentTier ?? 0) < 3 && (
            <form action={forceEscalateAction}>
              <input type="hidden" name="jobType" value={j.jobType} />
              <input type="hidden" name="jobId" value={j.jobId} />
              <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-medium px-2.5 py-1 ring-1 ring-amber-300">
                <FastForward size={11} /> Escalate
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
