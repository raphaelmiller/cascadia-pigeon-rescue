// Volunteer service-record page. No leaderboards (Christina's spec --
// "this is a service record"). One person's contribution over time.

import { requireVolunteer } from '@/lib/volunteer/auth';
import { getServiceRecord } from '@/lib/volunteer/service-record';
import { Trophy, Sparkles, Activity, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL: Record<string, string> = {
  rescue: '🚨 Rescue',
  transport: '🚚 Transport',
  foster: '🐦 Foster',
  check_in: '✅ Check-ins',
  coordination: '🛠 Coordination',
  historical: '🏆 Historical',
  admin: 'Admin',
  system: 'System',
};

const RELIABILITY_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  mixed: 'Mixed',
  low: 'Could improve',
  new: 'Too new to rate',
};
const ACTIVITY_LABEL: Record<string, string> = {
  extremely: 'Extremely active',
  very: 'Very active',
  moderately: 'Moderately active',
  lightly: 'Lightly active',
  dormant: 'Dormant',
};

function bandTone(b: string): string {
  if (['excellent', 'extremely'].includes(b)) return 'bg-emerald-100 text-emerald-900 ring-emerald-300';
  if (['good', 'very'].includes(b)) return 'bg-teal-100 text-teal-900 ring-teal-300';
  if (['mixed', 'moderately'].includes(b)) return 'bg-yellow-100 text-yellow-900 ring-yellow-300';
  if (['low', 'lightly'].includes(b)) return 'bg-orange-100 text-orange-900 ring-orange-300';
  if (['new'].includes(b)) return 'bg-blue-100 text-blue-900 ring-blue-300';
  return 'bg-gray-100 text-gray-700 ring-gray-300';
}

function fmtRel(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default async function ServiceRecordPage() {
  const v = await requireVolunteer();
  const r = await getServiceRecord(v.profileId);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-50 via-white to-violet-50 shadow ring-1 ring-gray-200 p-5 text-center">
        <Trophy size={32} className="mx-auto text-teal-700 mb-2" />
        <p className="text-xs uppercase tracking-wide text-gray-500">Service record</p>
        <h1 className="text-4xl font-bold text-gray-900 mt-1">{r.totalPoints}</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          points banked over {r.totalEvents} action{r.totalEvents === 1 ? '' : 's'}
        </p>
        {r.pendingPoints > 0 && (
          <p className="text-[11px] text-violet-700 mt-1">
            +{r.pendingPoints} points pending coordinator review
          </p>
        )}
        <p className="text-[11px] text-gray-500 mt-2">
          Volunteering since {r.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Reliability + Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={18} className="text-teal-700" />
            <h2 className="text-sm font-semibold text-gray-900">Reliability</h2>
          </div>
          <span className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 ring-1 ${bandTone(r.reliability.band)}`}>
            {RELIABILITY_LABEL[r.reliability.band]}
          </span>
          <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-teal-500" style={{ width: `${r.reliability.score}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {r.reliability.claimsAccepted} claimed · {r.reliability.declines} declined · {r.reliability.noResponseTimeouts} no-response
          </p>
        </div>
        <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={18} className="text-violet-700" />
            <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
          </div>
          <span className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 ring-1 ${bandTone(r.activity.band)}`}>
            {ACTIVITY_LABEL[r.activity.band]}
          </span>
          <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-violet-500" style={{ width: `${r.activity.score}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {r.activity.events30d} actions in last 30d · {r.activity.events90d} in 90d
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-teal-700" />
          <h2 className="text-base font-semibold text-gray-900">Where your points come from</h2>
        </div>
        {r.byCategory.length === 0 ? (
          <p className="text-sm text-gray-600">
            No points yet. They&apos;ll start showing up as you claim, check in, and complete jobs.
          </p>
        ) : (
          <ul className="space-y-2">
            {r.byCategory.map(b => {
              const pct = r.totalPoints > 0 ? Math.round((b.points / r.totalPoints) * 100) : 0;
              return (
                <li key={b.category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{CATEGORY_LABEL[b.category] ?? b.category}</span>
                    <span className="text-gray-900 font-semibold">{b.points} pts <span className="text-gray-400 text-xs">({b.events} action{b.events === 1 ? '' : 's'})</span></span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recent history */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
          Recent activity
        </h2>
        {r.recentEvents.length === 0 ? (
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 p-4 text-sm text-gray-600">
            Nothing here yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {r.recentEvents.map(e => (
              <li key={e.id} className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 p-3 flex items-start gap-3">
                <div className="flex-grow min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-mono text-xs text-gray-500">{e.kind}</span>
                  </p>
                  {e.notes && <p className="text-xs text-gray-600 mt-0.5">{e.notes}</p>}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {fmtRel(e.createdAt)}
                    {e.approvalStatus === 'pending' && <span className="ml-2 text-violet-700">· pending review</span>}
                    {e.approvalStatus === 'rejected' && <span className="ml-2 text-red-700">· rejected</span>}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <span className={`text-sm font-bold ${e.pointDelta > 0 ? 'text-emerald-700' : e.pointDelta < 0 ? 'text-red-700' : 'text-gray-400'}`}>
                    {e.pointDelta > 0 ? '+' : ''}{e.pointDelta}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
