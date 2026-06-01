// PR H (2026-05-24) — Volunteer-facing rescue case detail page.
//
// Surface for the active Point Person (or any volunteer paged on the
// case) to:
//   - See the bird description, location, reporter info, timeline.
//   - Add field NOTES + PHOTOS (with points, capped per case).
//   - Hit "Unable to rescue" with a REQUIRED REASON — which
//     re-dispatches the case + opens Tier 2 on the 2nd pass instead
//     of terminating it.
//   - Undo their own close within 24h.
//
// Admin-side detail page (/rescue/cases/[id]) is unchanged in spirit
// but also gets undo + escalate semantics through job-resolution.ts.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { fmtDateTime } from '@/lib/utils';
import {
  passUnableAction,
  addRescueNoteAction,
  undoResolutionAction,
  toggleStandbyAction,
  takeoverAction,
  claimPointPersonAction,
  figuredOutAction,
  unmarkFiguredOutAction,
} from '@/app/(volunteer)/v/actions';
import {
  canVolunteerUndo,
  UNDO_WINDOW_HOURS,
  getFollowers,
  getCaseLastActivity,
  TAKEOVER_THRESHOLD_EMERGENCY_MS,
  TAKEOVER_THRESHOLD_ROUTINE_MS,
} from '@/lib/volunteer/job-resolution';
import { Siren, AlertTriangle, FileText, Camera, RotateCcw, Heart, UserPlus, Users, Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  needs_rescue: '🚨 Needs rescue',
  rescued: '✅ Rescued',
  escaped_flew_away: '💨 Escaped',
  closed_unable: '❌ Closed (admin)',
};

export default async function VolunteerRescueCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const v = await requireVolunteer();
  const { id } = await params;
  const sp = await searchParams;

  const [c, myAssignment, followers, lastActivityAt] = await Promise.all([
    prisma.rescueCase.findUnique({
      where: { id },
      include: {
        updates: { orderBy: { attemptedAt: 'desc' }, take: 30 },
        photos: { orderBy: { createdAt: 'asc' } },
        pointPerson: { select: { id: true, name: true } },
      },
    }),
    prisma.assignment.findFirst({
      where: { jobType: 'RescueCase', jobId: id, profileId: v.profileId },
      select: { id: true, status: true, standbyAt: true },
    }),
    getFollowers('RescueCase', id),
    getCaseLastActivity(id),
  ]);
  if (!c) notFound();
  if (!myAssignment) {
    // Volunteer isn't paged on this case — gentle gate, not a 404.
    return (
      <div className="space-y-4">
        <Link href="/rescue" className="text-sm text-teal-700 hover:underline">← Rescue</Link>
        <div className="rounded-2xl bg-white shadow ring-1 ring-amber-200 p-5">
          <h1 className="text-lg font-semibold text-amber-900">You&apos;re not on this case</h1>
          <p className="text-sm text-amber-800 mt-1">
            Only volunteers who were paged on a rescue can view its case page. If you should have been notified, message a coordinator.
          </p>
        </div>
      </div>
    );
  }

  const isPointPerson = c.pointPersonId === v.profileId;
  const isResolved = ['rescued', 'escaped_flew_away', 'closed_unable'].includes(c.status);
  const canUndo = isResolved && c.resolvedByProfileId === v.profileId &&
    canVolunteerUndo(c.resolvedAt, c.resolvedReversedAt);

  // PR I: take-over gating + heartbeat.
  const claimedByOther = !!c.pointPersonId && !isPointPerson;
  const iAmOnStandby = !!myAssignment.standbyAt;
  const idleMs = lastActivityAt ? Date.now() - lastActivityAt.getTime() : null;
  const threshold = c.emergencyFlag ? TAKEOVER_THRESHOLD_EMERGENCY_MS : TAKEOVER_THRESHOLD_ROUTINE_MS;
  const thresholdMin = Math.round(threshold / 60000);
  const idleMin = idleMs != null ? Math.round(idleMs / 60000) : null;
  const minsTillTakeoverUnlocks = idleMs != null ? Math.max(0, Math.ceil((threshold - idleMs) / 60000)) : null;
  const takeoverUnlocked = claimedByOther && !isResolved &&
    (v.isCoordinator || (idleMs != null && idleMs >= threshold));

  return (
    <div className="space-y-4">
      <Link href="/rescue" className="text-sm text-teal-700 hover:underline">← Rescue</Link>

      {/* Status banner */}
      {sp.msg && (
        <div className={`rounded-2xl ring-1 px-3 py-2 text-sm ${
          sp.msg === 'note_added' || sp.msg === 'standby_on' || sp.msg === 'took_over' ? 'bg-emerald-50 ring-emerald-200 text-emerald-900' :
          sp.msg.startsWith('takeover_failed') ? 'bg-amber-50 ring-amber-200 text-amber-900' :
          sp.msg === 'unable_needs_reason' ? 'bg-amber-50 ring-amber-200 text-amber-900' :
          sp.msg === 'note_empty' ? 'bg-amber-50 ring-amber-200 text-amber-900' :
          'bg-gray-50 ring-gray-200 text-gray-800'
        }`}>
          {sp.msg === 'note_added' && '✅ Added — thanks for the detail.'}
          {sp.msg === 'unable_needs_reason' && '⚠️ Add a short reason so the next volunteer has context.'}
          {sp.msg === 'note_empty' && '⚠️ Add text or at least one photo.'}
          {sp.msg === 'standby_on' && '✅ You’re on standby. We’ll ping you if the lead drops or goes silent.'}
          {sp.msg === 'standby_off' && 'Standby cleared.'}
          {sp.msg === 'took_over' && '✅ You’re now Point Person. Old lead has been notified.'}
          {sp.msg === 'takeover_failed:too_soon' && '⚠️ The lead is still within the activity window. Try again later.'}
          {sp.msg === 'takeover_failed:race_lost' && '⚠️ Someone beat you to the take-over.'}
          {sp.msg === 'takeover_failed:already_pp' && '✅ You’re already Point Person.'}
          {sp.msg === 'figured_out' && '✅ Marked as Handled. Fan-out paused; case stays open.'}
          {sp.msg === 'unmarked_handled' && '✅ Un-marked. Dispatch re-opened.'}
          {sp.msg === 'undeclined' && '✅ You’re back in. We’ll re-notify if needed.'}
          {sp.msg?.startsWith('undecline_failed') && '⚠️ Couldn’t un-decline — the case may already be claimed or resolved.'}
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Siren size={22} className="text-red-600" />
          <h1 className="text-xl font-semibold text-gray-900 flex-grow">
            {c.birdDescription || c.issue || 'Rescue case'}
          </h1>
          <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-gray-800">
            {STATUS_LABEL[c.status] ?? c.status}
          </span>
        </div>
        {c.location && <p className="text-sm text-gray-700 mt-2">📍 {c.location}</p>}
        {c.address && <p className="text-sm text-gray-600">{c.address}</p>}
        {c.issue && <p className="text-sm text-gray-700 mt-1">⚠️ {c.issue}</p>}
        <p className="text-xs text-gray-500 mt-2">
          Called in {fmtDateTime(c.dateCalledIn)}
          {c.unablePassedCount > 0 && (
            <> · <span className="text-amber-700 font-semibold">passed {c.unablePassedCount}×</span></>
          )}
        </p>
        {c.reporterName && (
          <p className="text-xs text-gray-600 mt-1">
            Reporter: <strong>{c.reporterName}</strong>
            {c.reporterPhone && <> · <a href={`tel:${c.reporterPhone}`} className="text-teal-700 hover:underline">{c.reporterPhone}</a></>}
          </p>
        )}
      </div>

      {/* PR I: "Who's on it" / Point Person + followers card */}
      {!isResolved && (
        <div className={`rounded-2xl bg-white shadow ring-1 p-4 ${claimedByOther && idleMs != null && idleMs >= threshold ? 'ring-amber-300' : 'ring-gray-200'}`}>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-grow min-w-0">
              {isPointPerson && (
                <p className="text-sm font-semibold text-emerald-900">You are Point Person.</p>
              )}
              {claimedByOther && (
                <p className="text-sm">
                  <strong>{c.pointPerson?.name}</strong> is leading this rescue.
                </p>
              )}
              {!c.pointPersonId && (
                <p className="text-sm font-semibold text-amber-900">No one has claimed Point Person yet.</p>
              )}
              {idleMs != null && (
                <p className="text-[11px] text-gray-600 mt-1 inline-flex items-center gap-1">
                  <Clock size={11} />
                  Last activity {idleMin}m ago
                  {claimedByOther && (
                    idleMs >= threshold
                      ? <span className="text-amber-700 font-semibold"> · past the {thresholdMin}m threshold</span>
                      : <span className="text-gray-500"> · take-over unlocks in {minsTillTakeoverUnlocks}m</span>
                  )}
                </p>
              )}
              {followers.length > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Users size={12} className="text-gray-500" />
                  <span className="text-[11px] text-gray-600">On standby:</span>
                  {followers.map(f => (
                    <span key={f.id} className="inline-flex items-center gap-1 text-[11px] text-emerald-900 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
                      <Heart size={9} className="fill-emerald-700" />
                      {f.profile.name}
                      {f.profileId === v.profileId && <span className="text-emerald-600">(you)</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {!c.pointPersonId && (
              <form action={claimPointPersonAction}>
                <input type="hidden" name="jobType" value="RescueCase" />
                <input type="hidden" name="jobId" value={c.id} />
                <button type="submit" className="rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5">
                  Claim Point Person
                </button>
              </form>
            )}
            {claimedByOther && (
              <form action={toggleStandbyAction}>
                <input type="hidden" name="jobType" value="RescueCase" />
                <input type="hidden" name="jobId" value={c.id} />
                <input type="hidden" name="standby" value={iAmOnStandby ? '0' : '1'} />
                <button
                  type="submit"
                  className={`inline-flex items-center gap-1 rounded-lg text-xs font-semibold px-3 py-1.5 ${
                    iAmOnStandby
                      ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 ring-1 ring-emerald-300'
                      : 'bg-white hover:bg-gray-50 text-gray-700 ring-1 ring-gray-300'
                  }`}
                >
                  <Heart size={12} className={iAmOnStandby ? 'fill-emerald-700' : ''} />
                  {iAmOnStandby ? 'Standing by ✓' : `Back up ${c.pointPerson?.name?.split(' ')[0] ?? 'lead'}`}
                </button>
              </form>
            )}
            {takeoverUnlocked && (
              <form action={takeoverAction}>
                <input type="hidden" name="jobId" value={c.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5"
                  title={`${c.pointPerson?.name ?? 'Lead'} has been silent — step in as Point Person`}
                >
                  <UserPlus size={12} /> Take over
                </button>
              </form>
            )}
          </div>

          {/* Explanatory copy fixing the "Theo's got it, I don't need to show up" trap. */}
          {claimedByOther && (
            <p className="text-[11px] text-gray-600 mt-3 italic">
              {iAmOnStandby
                ? `You're standing by. If ${c.pointPerson?.name?.split(' ')[0] ?? 'the lead'} drops or goes silent, you'll be the next to step in.`
                : `${c.pointPerson?.name?.split(' ')[0] ?? 'The lead'} has it for now — but rescues fail when everyone assumes someone else is handling it. Tap “Back up” so we know you're ready if needed.`}
            </p>
          )}
        </div>
      )}

      {/* Undo block */}
      {canUndo && (
        <form action={undoResolutionAction} className="rounded-2xl bg-amber-50 shadow ring-1 ring-amber-300 p-4">
          <input type="hidden" name="jobType" value="RescueCase" />
          <input type="hidden" name="jobId" value={c.id} />
          <div className="flex items-start gap-3">
            <RotateCcw size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-grow">
              <p className="text-sm font-semibold text-amber-900">
                Closed by accident?
              </p>
              <p className="text-xs text-amber-800 mt-1">
                You can un-close this case for the next {Math.round(UNDO_WINDOW_HOURS)} hours after closing.
                It will re-open and re-notify the volunteer pool.
              </p>
              <input
                name="reason"
                placeholder="Optional: what happened"
                className="block w-full mt-2 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="mt-2 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                Un-close + re-open
              </button>
            </div>
          </div>
        </form>
      )}

      {/* PR J (2026-05-24): unified ACTIVITY card.
          Composer at top + Photos strip + Timeline log inline as one thread.
          Was three separate stacked cards — noisy and unclear which thing
          was which. This reads like a chat / project log instead. */}
      <div
        id="notes"
        className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 space-y-4 scroll-mt-20"
      >
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <FileText size={18} className="text-blue-600" /> Activity
        </h2>

        {/* Composer — only when the case is still active. */}
        {!isResolved && (
          <form action={addRescueNoteAction} className="space-y-3">
            <input type="hidden" name="jobId" value={c.id} />
            <textarea
              name="text"
              rows={3}
              placeholder="What's happening? e.g. 'Arrived on scene. Bird is under the dumpster, hopping not flying — likely wing injury. Owner of building was helpful.'"
              className="block w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                <Camera size={14} />
                <span className="underline">Add photos</span>
                <input type="file" name="photos" multiple accept="image/*" className="sr-only" />
              </label>
              <button type="submit" className="rounded-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2">
                Post update
              </button>
              <span className="text-[11px] text-gray-500 ml-auto">+1 pt per note · +2 per photo · capped +5/case</span>
            </div>
          </form>
        )}

        {/* Photos strip (if any) */}
        {c.photos.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2">Photos ({c.photos.length})</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {c.photos.map(p => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt="" className="w-full h-24 object-cover rounded-lg" />
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
            Timeline ({c.updates.length})
          </p>
          {c.updates.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No updates yet. Be the first to post.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {c.updates.map(u => (
                <li key={u.id} className="py-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <span>{fmtDateTime(u.attemptedAt)}</span>
                    {u.category === 'volunteer_note' && (
                      <span className="rounded-full px-1.5 py-0 text-[10px] bg-blue-100 text-blue-800 font-semibold">FIELD NOTE</span>
                    )}
                    {u.authorName && <span>· {u.authorName}</span>}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{u.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PR-Christina-feedback: Figured Out / Handled block.
            Christina (2026-05-25): "How are we defining 'figured out'? Is
            it clear to people when and why they should mark things
            'figured out'?" Old UI was a tiny ghost link with one-line
            tooltip — not enough context for new volunteers. New copy
            spells out the use-case + makes the action reversible. */}
        {isPointPerson && !isResolved && !c.figuredOutAt && (
          <form action={figuredOutAction} className="pt-3 border-t border-gray-100 space-y-2">
            <input type="hidden" name="jobType" value="RescueCase" />
            <input type="hidden" name="jobId" value={c.id} />
            <div>
              <p className="text-xs font-semibold text-gray-700">Situation handled outside the app?</p>
              <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                Use “Mark as Handled” (a.k.a. Figured Out) when something
                was sorted without going through the portal — e.g. someone
                arranged transport via text, the bird was already picked
                up, or the reporter says the issue resolved itself. This
                stops notifications to other volunteers but keeps the case
                <strong> open </strong> for notes. You can undo it anytime.
              </p>
            </div>
            <button
              type="submit"
              className="rounded-full bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 ring-1 ring-gray-300"
            >
              Mark as Handled <span className="text-[10px] text-gray-400 font-normal">(Figured Out)</span>
            </button>
          </form>
        )}

        {/* PR-Christina-feedback: Un-mark Handled (undo for Figured Out).
            Christina: "Actions should be able to be undone if someone
            misunderstood something or pressed something by accident."
            Clearing figuredOutAt re-opens the fan-out via dispatchJob(). */}
        {isPointPerson && !isResolved && c.figuredOutAt && (
          <form action={unmarkFiguredOutAction} className="pt-3 border-t border-gray-100 space-y-2">
            <input type="hidden" name="jobType" value="RescueCase" />
            <input type="hidden" name="jobId" value={c.id} />
            <div>
              <p className="text-xs font-semibold text-amber-900">
                This case is marked <em>Handled</em> (Figured Out) — fan-out is paused.
              </p>
              <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                If you tapped this by accident or the situation isn’t
                actually handled, un-mark to re-open the dispatch + notify
                the volunteer pool again.
              </p>
            </div>
            <button
              type="submit"
              className="rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5"
            >
              Un-mark Handled (re-open dispatch)
            </button>
          </form>
        )}
      </div>

      {/* PR J: SOFTENED Unable card.
          OLD copy was hall-monitor-vibes ("required", "+1 pt promise", scolding bullet list).
          NEW copy is collaborative: "so we can figure out how to overcome the issues and help
          the bird." Points go through coordinator review (auto +1 for honest post, +2 pending
          review for high-effort attempt). */}
      {isPointPerson && c.status === 'needs_rescue' && (
        <form
          id="unable"
          action={passUnableAction}
          className="rounded-2xl bg-white shadow ring-1 ring-amber-300 p-5 space-y-3 scroll-mt-20"
        >
          <input type="hidden" name="jobId" value={c.id} />
          <h2 className="text-base font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" /> Unable to rescue — escalate
          </h2>
          <p className="text-sm text-gray-700">
            Please share what happened so coordinators + the next volunteer can figure out how to
            overcome the obstacles and still help the bird. This <strong>does not close the case</strong> —
            it sends it back to the pool with your context.
          </p>
          <p className="text-xs text-gray-600">
            Common situations — mention what applies:
          </p>
          <ul className="text-[11px] text-gray-600 list-disc list-inside space-y-0.5">
            <li>Couldn&apos;t locate the bird</li>
            <li>Bird flew off / moved before I arrived</li>
            <li>No access to the property / owner refused</li>
            <li>Safety risk (busy road, dog, etc.)</li>
            <li>Need help — escalate to a coordinator</li>
          </ul>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">
              What happened?
            </span>
            <textarea
              name="reason"
              required
              minLength={4}
              rows={3}
              placeholder="e.g. 'Got there but bird had flown to the roof of the auto shop. Last seen heading east. Brought a net but couldn't reach.'"
              className="block w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <p className="text-[11px] text-gray-600 italic">
            Coordinators will review this and may award points for high-effort attempts. You&apos;ll get
            +1 banked automatically for posting an honest hand-off; a bonus is judged on context.
          </p>
          <button type="submit" className="rounded-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2">
            Send to coordinators + pass to next volunteer
          </button>
        </form>
      )}
    </div>
  );
}
