// Job-resolution primitives shared by the admin and volunteer portals.
//
// One source of truth for "how to resolve a rescue case" / "how to
// resolve a transport request". Both surfaces (admin detail page +
// volunteer assignment cards) call into here so behavior cannot drift.
//
// Each resolution:
//   1. Updates the underlying job's `status` field
//   2. Closes any open Escalation rows on the job
//   3. Resolves all Assignment rows on the job
//   4. Logs a VolunteerEvent with the right point value
//
// PR H (2026-05-24):
//   - 'closed_unable' is NO LONGER a terminal status reachable from the
//     volunteer surface. A Point Person hitting "Unable to rescue" now
//     calls passUnable() which escalates the case + re-dispatches.
//   - Every resolution writes resolvedAt + resolvedByProfileId so the
//     case can be Undo-closed within a 24h window (admins anytime).
//   - reverseResolution() un-resolves a case, reverses points by
//     writing offsetting VolunteerEvent rows + marking originals
//     reversedAt.

import { prisma } from '@/lib/prisma';
import { logEvent } from './events';
import type { JobType } from './dispatch';
import { dispatchJob } from './dispatch';
import { fmtDate } from '@/lib/utils';

// PR J (2026-05-24): added 'deceased' — bird found dead or died at the scene.
// Creates a Bird record marked status='deceased' for memorial + stats.
export type RescueResolution = 'rescued' | 'escaped_flew_away' | 'closed_unable' | 'deceased';
export type TransportResolution = 'in_transit' | 'delivered' | 'cancelled';

const POINTS = {
  rescued: 5,
  escaped_flew_away: 2,   // showed up, did the work, bird flew off -- still credit
  closed_unable: 1,       // admin-only terminal close — minimal credit
  deceased: 5,            // PR J: same effort as a rescue — outcome was outside the volunteer's control
  in_transit: 0,          // just a state change, no points yet
  delivered: 5,
  cancelled: 0,
} as const;

const POINT_KIND: Record<string, string> = {
  rescued: 'rescue.resolved_rescued',
  escaped_flew_away: 'rescue.resolved_escaped',
  closed_unable: 'rescue.resolved_unable',
  deceased: 'rescue.resolved_deceased',
  in_transit: 'transport.in_transit',
  delivered: 'transport.delivered',
  cancelled: 'transport.cancelled',
};

// PR J (2026-05-24): two-tier reward for "Unable":
//   • +1 auto-bank — reward for showing up + posting a note. No review.
//   • +2 PENDING REVIEW — "high-effort attempt" judgment call. Coordinator
//     decides in the approval queue. Could be approved as 0 / 2 / adjusted.
// Tracked as TWO separate VolunteerEvents so the audit reads clean.
const UNABLE_AUTO_POINTS    = 1;
const UNABLE_AUTO_KIND      = 'rescue.unable_passed';        // legacy kind, kept for back-compat
const UNABLE_REVIEW_POINTS  = 2;
const UNABLE_REVIEW_KIND    = 'rescue.unable_high_effort';   // pending review

// Window in which the original actor (or any admin) can undo a
// resolution from the volunteer portal. Admins can undo anytime from
// the admin app.
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const PHASE1_DISABLED_KINDS = new Set<string>([
  // Add rule-engine-disabled rules here in Phase 2. For now, all the
  // resolution rules emit points immediately because there are only a
  // handful of them.
]);

export type ResolveResult =
  | { ok: true; jobType: JobType; jobId: string; newStatus: string; pointsAwarded: number }
  | { ok: false; reason: 'not_found' | 'already_resolved' | 'forbidden' };

/**
 * Resolve a job to a terminal status. Idempotent per resolution: calling
 * `resolveJob(...'rescued')` twice is a no-op the second time.
 *
 * `actorProfileId` is the VolunteerProfile that triggered the resolution.
 * For admin actions, pass null -- no points are awarded and the audit
 * row uses category="admin".
 */
export async function resolveJob(args: {
  jobType: JobType;
  jobId: string;
  resolution: RescueResolution | TransportResolution;
  actorProfileId: string | null;
}): Promise<ResolveResult> {
  const { jobType, jobId, resolution, actorProfileId } = args;
  const now = new Date();

  // Validate resolution matches job type.
  if (jobType === 'RescueCase') {
    if (!['rescued', 'escaped_flew_away', 'closed_unable', 'deceased'].includes(resolution)) {
      return { ok: false, reason: 'forbidden' };
    }
    // closed_unable is now admin-only. From the volunteer portal the
    // path is `passUnable()`; from the admin app actorProfileId is null.
    if (resolution === 'closed_unable' && actorProfileId !== null) {
      return { ok: false, reason: 'forbidden' };
    }
  } else {
    if (!['in_transit', 'delivered', 'cancelled'].includes(resolution)) {
      return { ok: false, reason: 'forbidden' };
    }
  }

  // Load job to confirm existence + check current state.
  let currentStatus: string;
  // PR J: for deceased resolutions we need the case context to build a Bird record.
  type RescueCaseCtx = {
    status: string;
    birdDescription: string | null;
    issue: string | null;
    location: string | null;
    address: string | null;
    reporterName: string | null;
    reporterPhone: string | null;
    reporterContact: string | null;
    rescuedBirdId: string | null;
  };
  let rescueCaseCtx: RescueCaseCtx | null = null;
  if (jobType === 'RescueCase') {
    const job = await prisma.rescueCase.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        birdDescription: true,
        issue: true,
        location: true,
        address: true,
        reporterName: true,
        reporterPhone: true,
        reporterContact: true,
        rescuedBirdId: true,
      },
    });
    if (!job) return { ok: false, reason: 'not_found' };
    currentStatus = job.status;
    rescueCaseCtx = job;
  } else {
    const job = await prisma.transportRequest.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job) return { ok: false, reason: 'not_found' };
    currentStatus = job.status;
  }
  if (currentStatus === resolution) {
    return { ok: false, reason: 'already_resolved' };
  }

  // Atomic transition + cleanup.
  await prisma.$transaction(async (tx) => {
    if (jobType === 'RescueCase') {
      // PR J: Deceased → create a Bird record marked status='deceased' for
      // memorial + informational tracking. Skip if the case already has one.
      let birdIdToLink: string | null = rescueCaseCtx?.rescuedBirdId ?? null;
      let createdMemorialBird = false;
      if (resolution === 'deceased' && !birdIdToLink && rescueCaseCtx) {
        const birdName = rescueCaseCtx.birdDescription
          ? rescueCaseCtx.birdDescription.slice(0, 80)
          : `Memorial — found ${fmtDate(new Date())}`;
        const memorialBird = await tx.bird.create({
          data: {
            name: birdName,
            foundLocation: rescueCaseCtx.location || rescueCaseCtx.address || null,
            finderName: rescueCaseCtx.reporterName,
            finderContact: rescueCaseCtx.reporterPhone || rescueCaseCtx.reporterContact,
            behaviorNotes: rescueCaseCtx.issue,
            status: 'deceased',
          },
        });
        birdIdToLink = memorialBird.id;
        createdMemorialBird = true;
      }

      await tx.rescueCase.update({
        where: { id: jobId },
        data: {
          status: resolution,
          resolvedAt: now,
          resolvedByProfileId: actorProfileId,
          resolvedReversedAt: null,
          ...(birdIdToLink && !rescueCaseCtx?.rescuedBirdId ? { rescuedBirdId: birdIdToLink } : {}),
        },
      });
      await tx.rescueCaseUpdate.create({
        data: {
          caseId: jobId,
          text: createdMemorialBird
            ? `Status changed → deceased. Memorial Bird record created.`
            : `Status changed → ${resolution}`,
          category: 'system',
          authorProfileId: actorProfileId,
        },
      });
    } else {
      await tx.transportRequest.update({
        where: { id: jobId },
        data: {
          status: resolution,
          resolvedAt: now,
          resolvedByProfileId: actorProfileId,
          resolvedReversedAt: null,
        },
      });
    }

    // Close any open escalations on this job.
    await tx.escalation.updateMany({
      where: { jobType, jobId, closedAt: null },
      data: { closedAt: now, outcome: 'job_resolved' },
    });

    // Mark all Assignment rows resolved (status=resolved).
    await tx.assignment.updateMany({
      where: { jobType, jobId, status: { in: ['notified', 'claimed'] } },
      data: { status: 'resolved', resolvedAt: now },
    });
  });

  // Award points to the actor (if any) outside the transaction so a
  // point-log failure can't roll back the resolution.
  const pointValue = POINTS[resolution as keyof typeof POINTS] ?? 0;
  const enabled = !PHASE1_DISABLED_KINDS.has(POINT_KIND[resolution]);
  if (actorProfileId && enabled && pointValue > 0) {
    await logEvent({
      profileId: actorProfileId,
      category: jobType === 'RescueCase' ? 'rescue' : 'transport',
      kind: POINT_KIND[resolution],
      pointDelta: pointValue,
      refType: jobType,
      refId: jobId,
    });
  }

  return {
    ok: true,
    jobType, jobId,
    newStatus: resolution,
    pointsAwarded: actorProfileId ? pointValue : 0,
  };
}

// ---------------------------------------------------------------------
// PR H: passUnable() — the new "I couldn't rescue this bird" flow.
// ---------------------------------------------------------------------
// The current Point Person tried, couldn't get the bird, and is passing
// the case back to the dispatch pool. Concretely:
//   1. Append a timeline entry capturing the reason (required, plain text).
//   2. Mark the actor's Assignment row as `unable` (was: notified|claimed).
//   3. Clear pointPersonId / pointPersonClaimedAt so the next claimer
//      doesn't see a stale claim.
//   4. Set unableReason on the RescueCase + bump unablePassedCount.
//   5. Keep status = 'needs_rescue' (it never left that — the bird is
//      still out there).
//   6. Re-dispatch: re-open Tier 1 with a fresh 15-min timer, push SMS
//      to the next-nearest pool, and if it's been passed >=2 times OR is
//      an emergency, open Tier 2 (coordinators) too.
//   7. Award the actor `rescue.unable_passed` (+1 pt) for showing up and
//      being honest — beats sitting on a case.
//
// Returns reason='not_point_person' if the actor isn't the current PP.
// ---------------------------------------------------------------------
export type PassUnableResult =
  | { ok: true; reDispatched: boolean; tier2Opened: boolean; passedCount: number }
  | { ok: false; reason: 'not_found' | 'not_point_person' | 'not_active' | 'no_reason' };

export async function passUnable(args: {
  jobId: string;
  actorProfileId: string;
  reason: string;
}): Promise<PassUnableResult> {
  const { jobId, actorProfileId, reason } = args;
  const trimmed = (reason || '').trim();
  if (!trimmed) return { ok: false, reason: 'no_reason' };

  const c = await prisma.rescueCase.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      pointPersonId: true,
      emergencyFlag: true,
      unablePassedCount: true,
    },
  });
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.pointPersonId !== actorProfileId) return { ok: false, reason: 'not_point_person' };
  if (c.status !== 'needs_rescue') return { ok: false, reason: 'not_active' };

  const now = new Date();
  const newPassedCount = (c.unablePassedCount ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    // 1 + 4 + 5: update case (keep needs_rescue, clear PP, stash reason).
    await tx.rescueCase.update({
      where: { id: jobId },
      data: {
        status: 'needs_rescue',
        pointPersonId: null,
        pointPersonClaimedAt: null,
        figuredOutAt: null,
        unableReason: trimmed.slice(0, 1000),
        unablePassedCount: newPassedCount,
      },
    });

    // Timeline entry.
    await tx.rescueCaseUpdate.create({
      data: {
        caseId: jobId,
        text: `Volunteer passed — couldn't rescue: ${trimmed.slice(0, 800)}`,
        category: 'volunteer_note',
        authorProfileId: actorProfileId,
      },
    });

    // 2: mark the actor's Assignment row as unable (audit trail).
    await tx.assignment.updateMany({
      where: { jobType: 'RescueCase', jobId, profileId: actorProfileId, status: { in: ['notified', 'claimed'] } },
      data: { status: 'unable', resolvedAt: now },
    });

    // Close any open Escalation tiers — dispatchJob will reopen Tier 1
    // (and Tier 2 if needed) fresh.
    await tx.escalation.updateMany({
      where: { jobType: 'RescueCase', jobId, closedAt: null },
      data: { closedAt: now, outcome: 'passed_unable' },
    });
  });

  // 7: two-tier point reward.
  //   (a) +1 AUTO — reward for posting a clear hand-off note. Banked immediately.
  //   (b) +2 PENDING REVIEW — "high-effort attempt" judgment call, Christina
  //       + coordinators decide in /dispatch/queue.
  await logEvent({
    profileId: actorProfileId,
    category: 'rescue',
    kind: UNABLE_AUTO_KIND,
    pointDelta: UNABLE_AUTO_POINTS,
    refType: 'RescueCase',
    refId: jobId,
    notes: trimmed.slice(0, 500),
    approvalStatus: 'auto',
  });
  await logEvent({
    profileId: actorProfileId,
    category: 'rescue',
    kind: UNABLE_REVIEW_KIND,
    pointDelta: UNABLE_REVIEW_POINTS,
    refType: 'RescueCase',
    refId: jobId,
    notes: trimmed.slice(0, 500),
    approvalStatus: 'pending',
  });

  // 6: re-dispatch. If this case has been passed >=2 times OR is an
  // emergency, force tier 2 by flipping emergencyFlag for the dispatch
  // pass (we don't persist that — dispatchJob reads emergencyFlag from
  // the case itself, so we use the natural emergency promotion below).
  // Simpler: just call dispatchJob; the engine already opens Tier 2 if
  // emergencyFlag OR (deadline - now) < 30 min.
  let tier2Opened = false;
  let reDispatched = false;
  try {
    const result = await dispatchJob('RescueCase', jobId, {
      reason: newPassedCount >= 2 ? 'unable_repassed' : 'unable_passed',
    });
    reDispatched = result.assignmentsCreated > 0 || result.escalationsOpened > 0;
    tier2Opened = result.isEmergency;

    // If the case has been passed >=2 times, force-open Tier 2 even if
    // it's not flagged emergency. Two volunteers couldn't get the bird;
    // a coordinator should weigh in.
    if (newPassedCount >= 2 && !tier2Opened) {
      const existingT2 = await prisma.escalation.findFirst({
        where: { jobType: 'RescueCase', jobId, tier: 2, closedAt: null },
      });
      if (!existingT2) {
        await prisma.escalation.create({
          data: {
            jobType: 'RescueCase',
            jobId,
            tier: 2,
            expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
          },
        });
        tier2Opened = true;
      }
    }
  } catch (err) {
    // Don't fail the entire passUnable if dispatch sputters — the case
    // is in a valid state (needs_rescue, no PP), it just won't have
    // fresh SMS fan-out. Admin will see the case in the queue.
    console.error('[passUnable] re-dispatch failed', err);
  }

  return { ok: true, reDispatched, tier2Opened, passedCount: newPassedCount };
}

// ---------------------------------------------------------------------
// PR H: reverseResolution() — undo a close.
// ---------------------------------------------------------------------
// `actorProfileId === null` ⇒ admin override (no time window enforced).
// Otherwise the actor must be the volunteer who originally resolved
// the job AND it must be within UNDO_WINDOW_MS.
//
// We:
//   1. Flip status back to needs_rescue (rescue) or open (transport).
//   2. Set resolvedReversedAt = now (so we know it was undone).
//   3. Find every non-reversed VolunteerEvent for (refType, refId) and
//      either zero them out OR write an offsetting event. We choose
//      offsetting so the original points history is preserved + the
//      audit reads cleanly.
//   4. Append a timeline entry on rescues.
//   5. Re-dispatch the case (rescue only — transports don't auto-dispatch).
// ---------------------------------------------------------------------
export type ReverseResult =
  | { ok: true; pointsReversed: number; newStatus: string }
  | { ok: false; reason: 'not_found' | 'not_resolved' | 'forbidden' | 'window_expired' };

export async function reverseResolution(args: {
  jobType: JobType;
  jobId: string;
  actorProfileId: string | null;
  reason?: string;
}): Promise<ReverseResult> {
  const { jobType, jobId, actorProfileId, reason } = args;
  const now = new Date();
  const reasonText = (reason || '').trim().slice(0, 500) || 'Closed by accident';

  let job: { status: string; resolvedAt: Date | null; resolvedByProfileId: string | null } | null;
  if (jobType === 'RescueCase') {
    job = await prisma.rescueCase.findUnique({
      where: { id: jobId },
      select: { status: true, resolvedAt: true, resolvedByProfileId: true },
    });
  } else {
    job = await prisma.transportRequest.findUnique({
      where: { id: jobId },
      select: { status: true, resolvedAt: true, resolvedByProfileId: true },
    });
  }
  if (!job) return { ok: false, reason: 'not_found' };
  if (!job.resolvedAt) return { ok: false, reason: 'not_resolved' };

  // Non-admin actors must be the original resolver AND within the window.
  if (actorProfileId !== null) {
    if (job.resolvedByProfileId !== actorProfileId) {
      return { ok: false, reason: 'forbidden' };
    }
    if (now.getTime() - job.resolvedAt.getTime() > UNDO_WINDOW_MS) {
      return { ok: false, reason: 'window_expired' };
    }
  }

  // Find original (non-reversed) events to offset.
  const originals = await prisma.volunteerEvent.findMany({
    where: { refType: jobType, refId: jobId, reversedAt: null, pointDelta: { not: 0 } },
  });

  const newStatus = jobType === 'RescueCase' ? 'needs_rescue' : 'open';

  await prisma.$transaction(async (tx) => {
    if (jobType === 'RescueCase') {
      await tx.rescueCase.update({
        where: { id: jobId },
        data: {
          status: newStatus,
          resolvedReversedAt: now,
          pointPersonId: null,
          pointPersonClaimedAt: null,
          figuredOutAt: null,
        },
      });
      await tx.rescueCaseUpdate.create({
        data: {
          caseId: jobId,
          text: `Resolution reversed (${reasonText}) — case re-opened.`,
          category: 'system',
          authorProfileId: actorProfileId,
        },
      });
    } else {
      await tx.transportRequest.update({
        where: { id: jobId },
        data: {
          status: newStatus,
          resolvedReversedAt: now,
          pointPersonId: null,
          pointPersonClaimedAt: null,
          figuredOutAt: null,
        },
      });
    }

    // Mark originals reversed + offset.
    for (const ev of originals) {
      await tx.volunteerEvent.update({
        where: { id: ev.id },
        data: { reversedAt: now, reversedReason: reasonText },
      });
      await tx.volunteerEvent.create({
        data: {
          profileId: ev.profileId,
          category: ev.category,
          kind: ev.kind + '.reversed',
          pointDelta: -ev.pointDelta,
          approvalStatus: 'auto',
          refType: ev.refType,
          refId: ev.refId,
          notes: `Reversed: ${reasonText}`,
        },
      });
    }

    // Re-open any assignments that were resolved by this resolution so
    // they show up in the volunteer's active list again.
    await tx.assignment.updateMany({
      where: { jobType, jobId, status: 'resolved' },
      data: { status: 'notified', resolvedAt: null },
    });
  });

  // Re-dispatch rescue cases so the pool gets a fresh notification.
  if (jobType === 'RescueCase') {
    try {
      await dispatchJob('RescueCase', jobId, { reason: 'undo_close' });
    } catch (err) {
      console.error('[reverseResolution] re-dispatch failed', err);
    }
  }

  const pointsReversed = originals.reduce((sum, ev) => sum + ev.pointDelta, 0);
  return { ok: true, pointsReversed, newStatus };
}

/** Helper: is this resolution still inside the volunteer undo window? */
export function canVolunteerUndo(resolvedAt: Date | null, resolvedReversedAt: Date | null): boolean {
  if (!resolvedAt) return false;
  if (resolvedReversedAt) return false;
  return Date.now() - resolvedAt.getTime() <= UNDO_WINDOW_MS;
}

export const UNDO_WINDOW_HOURS = UNDO_WINDOW_MS / (60 * 60 * 1000);

// ---------------------------------------------------------------------
// PR I (2026-05-24) — takeoverPointPerson()
// ---------------------------------------------------------------------
// A standby volunteer (or any paged volunteer in a pinch) can take over
// as Point Person if the current PP has gone dark past the heartbeat
// threshold. Rules:
//   • Emergency-flagged rescue: 10 min since last activity
//   • Non-emergency: 20 min since last activity
//   • Coordinators can take over anytime (admin override path)
//
// "Last activity" = max(pointPersonClaimedAt, most recent
// RescueCaseUpdate.createdAt, figuredOutAt). If the PP has been silent
// past the threshold, the takeover unblocks.
//
// The takeover is atomic: updateMany guarded on the current PP id so
// two simultaneous takeovers don't race. Winner becomes the new PP;
// the loser gets a friendly "already taken over" message.
// ---------------------------------------------------------------------

export const TAKEOVER_THRESHOLD_EMERGENCY_MS = 10 * 60 * 1000;
export const TAKEOVER_THRESHOLD_ROUTINE_MS   = 20 * 60 * 1000;

export type TakeoverResult =
  | { ok: true; previousPointPersonId: string | null; newStatus: 'rescue_active' }
  | { ok: false; reason: 'not_found' | 'not_paged' | 'too_soon' | 'already_pp' | 'race_lost' | 'resolved' };

/**
 * Compute the most-recent "signal of life" timestamp for a rescue case.
 * Used by both the takeover gate AND the UI to render the heartbeat nudge.
 */
export async function getCaseLastActivity(jobId: string): Promise<Date | null> {
  const c = await prisma.rescueCase.findUnique({
    where: { id: jobId },
    select: {
      pointPersonClaimedAt: true,
      figuredOutAt: true,
      updatedAt: true,
    },
  });
  if (!c) return null;
  const latestUpdate = await prisma.rescueCaseUpdate.findFirst({
    where: { caseId: jobId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const candidates = [
    c.pointPersonClaimedAt,
    c.figuredOutAt,
    latestUpdate?.createdAt ?? null,
  ].filter((d): d is Date => !!d);
  if (candidates.length === 0) return c.updatedAt ?? null;
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

export async function takeoverPointPerson(args: {
  jobId: string;
  actorProfileId: string;
  isCoordinator?: boolean;
}): Promise<TakeoverResult> {
  const { jobId, actorProfileId, isCoordinator } = args;
  const now = new Date();

  const c = await prisma.rescueCase.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      pointPersonId: true,
      pointPersonClaimedAt: true,
      emergencyFlag: true,
      figuredOutAt: true,
    },
  });
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.status !== 'needs_rescue') return { ok: false, reason: 'resolved' };
  if (c.pointPersonId === actorProfileId) return { ok: false, reason: 'already_pp' };

  // Actor must have been paged on this case (or be a coordinator).
  const assignment = await prisma.assignment.findFirst({
    where: {
      jobType: 'RescueCase',
      jobId,
      profileId: actorProfileId,
      status: { in: ['notified', 'claimed'] },
    },
    select: { id: true },
  });
  if (!assignment && !isCoordinator) return { ok: false, reason: 'not_paged' };

  // Threshold check (skipped for coordinators).
  if (!isCoordinator) {
    const last = await getCaseLastActivity(jobId);
    const threshold = c.emergencyFlag ? TAKEOVER_THRESHOLD_EMERGENCY_MS : TAKEOVER_THRESHOLD_ROUTINE_MS;
    const idleMs = last ? now.getTime() - last.getTime() : Infinity;
    if (idleMs < threshold) {
      return { ok: false, reason: 'too_soon' };
    }
  }

  const previousPointPersonId = c.pointPersonId;

  // Atomic swap: only succeed if pointPersonId hasn't changed since we read it.
  const swap = await prisma.rescueCase.updateMany({
    where: { id: jobId, pointPersonId: previousPointPersonId },
    data: {
      pointPersonId: actorProfileId,
      pointPersonClaimedAt: now,
      figuredOutAt: null,
    },
  });
  if (swap.count === 0) return { ok: false, reason: 'race_lost' };

  // Promote the actor's Assignment row to claimed; demote previous PP's
  // Assignment back to notified (so they still see the case + can stay
  // in the loop / re-claim if needed).
  await prisma.$transaction(async (tx) => {
    if (assignment) {
      await tx.assignment.update({
        where: { id: assignment.id },
        data: {
          status: 'claimed',
          claimedAt: now,
          standbyAt: null,
          standbyClearedAt: now,
        },
      });
    } else if (isCoordinator) {
      // Coordinator wasn't paged — create an assignment row so the
      // case shows up in their feed going forward.
      await tx.assignment.upsert({
        where: { jobType_jobId_profileId: { jobType: 'RescueCase', jobId, profileId: actorProfileId } },
        update: { status: 'claimed', claimedAt: now },
        create: {
          jobType: 'RescueCase',
          jobId,
          profileId: actorProfileId,
          status: 'claimed',
          claimedAt: now,
          source: 'manual',
        },
      });
    }
    if (previousPointPersonId) {
      await tx.assignment.updateMany({
        where: { jobType: 'RescueCase', jobId, profileId: previousPointPersonId, status: 'claimed' },
        data: { status: 'notified', claimedAt: null },
      });
    }

    // Timeline.
    await tx.rescueCaseUpdate.create({
      data: {
        caseId: jobId,
        text: isCoordinator
          ? `Coordinator took over as Point Person.`
          : `Point Person changed via take-over (idle past threshold).`,
        category: 'system',
        authorProfileId: actorProfileId,
      },
    });
  });

  return { ok: true, previousPointPersonId, newStatus: 'rescue_active' };
}

// ---------------------------------------------------------------------
// PR I: standby state — "I can back up [PP]"
// ---------------------------------------------------------------------
// Toggles the Assignment.standbyAt flag for a paged non-PP volunteer.
// No points (until Phase 2 rule tuning). Stays status='notified' so
// the assignment continues to show in the volunteer's feed.
// ---------------------------------------------------------------------
export type StandbyResult =
  | { ok: true; standing_by: boolean }
  | { ok: false; reason: 'not_paged' | 'is_pp' };

export async function setStandby(args: {
  jobType: 'RescueCase' | 'TransportRequest';
  jobId: string;
  actorProfileId: string;
  standing_by: boolean;
}): Promise<StandbyResult> {
  const { jobType, jobId, actorProfileId, standing_by } = args;
  const now = new Date();

  // Reject if the actor IS the current PP (use the resolve buttons instead).
  if (jobType === 'RescueCase') {
    const c = await prisma.rescueCase.findUnique({ where: { id: jobId }, select: { pointPersonId: true } });
    if (c?.pointPersonId === actorProfileId) return { ok: false, reason: 'is_pp' };
  } else {
    const t = await prisma.transportRequest.findUnique({ where: { id: jobId }, select: { pointPersonId: true } });
    if (t?.pointPersonId === actorProfileId) return { ok: false, reason: 'is_pp' };
  }

  const a = await prisma.assignment.findUnique({
    where: { jobType_jobId_profileId: { jobType, jobId, profileId: actorProfileId } },
    select: { id: true, status: true, standbyAt: true },
  });
  if (!a) return { ok: false, reason: 'not_paged' };

  await prisma.assignment.update({
    where: { id: a.id },
    data: standing_by
      ? { standbyAt: now, standbyClearedAt: null }
      : { standbyAt: null, standbyClearedAt: now },
  });
  return { ok: true, standing_by };
}

/**
 * List of follower profiles (paged volunteers in standby) for a job.
 * Used to render the avatar stack on the case page + AssignmentCard.
 */
export async function getFollowers(jobType: 'RescueCase' | 'TransportRequest', jobId: string) {
  return prisma.assignment.findMany({
    where: {
      jobType,
      jobId,
      standbyAt: { not: null },
      status: { in: ['notified', 'claimed'] },
    },
    orderBy: { standbyAt: 'asc' },
    select: {
      id: true,
      profileId: true,
      standbyAt: true,
      profile: { select: { name: true } },
    },
  });
}

