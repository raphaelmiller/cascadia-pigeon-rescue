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
// Point values are intentionally conservative defaults for Phase 1.5
// (e.g. rescued = 5, delivered = 5). Phase 2's rules engine will let
// Christina tune these from the admin UI.

import { prisma } from '@/lib/prisma';
import { logEvent } from './events';
import type { JobType } from './dispatch';

export type RescueResolution = 'rescued' | 'escaped_flew_away' | 'closed_unable';
export type TransportResolution = 'in_transit' | 'delivered' | 'cancelled';

const POINTS = {
  rescued: 5,
  escaped_flew_away: 2,   // showed up, did the work, bird flew off -- still credit
  closed_unable: 1,       // showed up, couldn't help -- minimal credit
  in_transit: 0,          // just a state change, no points yet
  delivered: 5,
  cancelled: 0,
} as const;

const POINT_KIND: Record<string, string> = {
  rescued: 'rescue.resolved_rescued',
  escaped_flew_away: 'rescue.resolved_escaped',
  closed_unable: 'rescue.resolved_unable',
  in_transit: 'transport.in_transit',
  delivered: 'transport.delivered',
  cancelled: 'transport.cancelled',
};

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
    if (!['rescued', 'escaped_flew_away', 'closed_unable'].includes(resolution)) {
      return { ok: false, reason: 'forbidden' };
    }
  } else {
    if (!['in_transit', 'delivered', 'cancelled'].includes(resolution)) {
      return { ok: false, reason: 'forbidden' };
    }
  }

  // Load job to confirm existence + check current state.
  let currentStatus: string;
  if (jobType === 'RescueCase') {
    const job = await prisma.rescueCase.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job) return { ok: false, reason: 'not_found' };
    currentStatus = job.status;
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
      await tx.rescueCase.update({ where: { id: jobId }, data: { status: resolution } });
      await tx.rescueCaseUpdate.create({
        data: {
          caseId: jobId,
          text: `Status changed -> ${resolution}`,
        },
      });
    } else {
      await tx.transportRequest.update({ where: { id: jobId }, data: { status: resolution } });
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
