// Cascadia Pigeon Rescue -- volunteer-portal DISPATCH ENGINE (Phase 1).
//
// Two entry points:
//   - dispatchJob(jobType, jobId): called immediately when a new
//     RescueCase or TransportRequest is created. Computes the candidate
//     volunteer set, writes Assignment rows, opens the appropriate
//     Escalation tier(s), and fans out SMS.
//   - sweepEscalations(): called by cron (every 60s) to expire timers
//     and promote to the next tier.
//
// Why polymorphic? Both job types share an identical dispatch lifecycle.
// Soft-FK via jobType + jobId means we extend to new job types (e.g.
// "foster_handoff") without DDL.
//
// Emergency fast-path: when emergencyFlag is set OR (deadline - now) <
// 30 min, we open ALL THREE tiers simultaneously (volunteers +
// coordinators + christina) and let the first claim close everything.
// Matches Christina's spec note: "deadline less than 30 min away gets
// sent directly to me and the coordinators as well as the transport or
// rescue ppl."

import { prisma } from '@/lib/prisma';
import { sendSms } from '@/lib/notify/sms';
import { logEvent } from './events';
import { hasAnyRole, type RoleTag } from './roles';

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const THIRTY_MIN_MS  = 30 * 60 * 1000;
const TWO_MIN_MS     = 2 * 60 * 1000;

// ---- types ----

export type JobType = 'RescueCase' | 'TransportRequest';

type JobSummary = {
  id: string;
  type: JobType;
  title: string;             // short SMS-safe summary
  emergencyFlag: boolean;
  deadline: Date | null;
  pointPersonId: string | null;
  figuredOutAt: Date | null;
  resolved: boolean;
  // Which role tags are eligible to handle this job.
  eligibleRoles: RoleTag[];
};

// ---- public API ----

export type DispatchResult = {
  jobType: JobType;
  jobId: string;
  isEmergency: boolean;
  candidateCount: number;
  assignmentsCreated: number;
  escalationsOpened: number;
  smsSent: number;
};

export async function dispatchJob(
  jobType: JobType,
  jobId: string,
  opts: { reason?: string } = {},
): Promise<DispatchResult> {
  const job = await loadJob(jobType, jobId);
  if (!job) throw new Error(`dispatch: job ${jobType}:${jobId} not found`);
  if (job.resolved || job.figuredOutAt) {
    return { jobType, jobId, isEmergency: false, candidateCount: 0,
      assignmentsCreated: 0, escalationsOpened: 0, smsSent: 0 };
  }

  const now = new Date();
  const isEmergency =
    job.emergencyFlag ||
    (job.deadline !== null && job.deadline.getTime() - now.getTime() < THIRTY_MIN_MS);

  // Candidate set: volunteers tagged with one of the eligible roles AND
  // available now AND not the reporter (we don't have a reporter id on
  // jobs yet, so this just filters by availability + roles).
  const candidates = await candidatesForJob(job, now);

  // Write Assignment rows. Idempotent via the (jobType, jobId, profileId)
  // unique constraint so a re-dispatch (e.g. on escalation) doesn't
  // duplicate.
  let assignmentsCreated = 0;
  for (const c of candidates) {
    const created = await prisma.assignment.upsert({
      where: {
        jobType_jobId_profileId: { jobType, jobId, profileId: c.id },
      },
      update: {}, // no-op on existing
      create: {
        jobType, jobId, profileId: c.id,
        source: isEmergency ? 'emergency_broadcast' : (opts.reason ?? 'shift_overlap'),
      },
    });
    if (created.createdAt.getTime() === created.updatedAt.getTime()) {
      assignmentsCreated++;
    }
  }

  // Open escalation tiers.
  const tiers: number[] = isEmergency ? [1, 2, 3] : [1];
  let escalationsOpened = 0;
  let smsSent = 0;

  for (const tier of tiers) {
    // Don't open a duplicate tier if one is already open for this job.
    const existing = await prisma.escalation.findFirst({
      where: { jobType, jobId, tier, closedAt: null },
    });
    if (existing) continue;

    // Tier timer:
    //   tier 1 normal: 15 min
    //   tier 1 emergency: still 15 min (acts as a "claim within 15" deadline)
    //   tier 2: 15 min
    //   tier 3: open until claimed (24h hard cap to prevent forever-rows)
    const expiresAt = new Date(
      now.getTime() + (tier === 3 ? 24 * 60 * 60 * 1000 : FIFTEEN_MIN_MS),
    );

    const escalation = await prisma.escalation.create({
      data: {
        jobType, jobId, tier, reason: isEmergency ? 'emergency' : 'timer',
        openedAt: now, expiresAt,
      },
    });
    escalationsOpened++;

    // Fan out SMS for this tier.
    const recipients = await recipientsForTier(tier, candidates);
    const dedupePrefix = `dispatch:${jobType}:${jobId}:t${tier}`;
    for (const r of recipients) {
      if (!r.phone) continue;
      const res = await sendSms({
        to: r.phone,
        tag: `dispatch_t${tier}`,
        dedupeKey: `${dedupePrefix}:${r.id}`,
        body: smsBody({ job, tier, isEmergency, recipientName: r.name }),
      });
      if (res.ok) smsSent++;
    }
    await prisma.escalation.update({
      where: { id: escalation.id },
      data: { smsFanout: recipients.length },
    });
  }

  // Audit event (0 points -- just lineage).
  if (candidates.length > 0) {
    await logEvent({
      profileId: candidates[0].id, // pick any candidate to anchor the audit row
      category: 'system',
      kind: 'dispatch.job_created',
      pointDelta: 0,
      refType: jobType,
      refId: jobId,
      notes: `Dispatched to ${candidates.length} candidate(s); emergency=${isEmergency}`,
    });
  }

  return {
    jobType, jobId, isEmergency,
    candidateCount: candidates.length,
    assignmentsCreated,
    escalationsOpened,
    smsSent,
  };
}

export type SweepResult = {
  scanned: number;
  expired: number;
  promoted: number;
  nudgesSent: number;
};

/**
 * Find open escalations whose timer has expired. For each, close it
 * (outcome = "timed_out") and open the next tier. Idempotent.
 *
 * Also runs the pre-shift Point Person nudge sweep -- jobs whose
 * deadline is within 5 minutes and have no Point Person claimed get
 * a one-shot SMS to coordinators ("nobody has claimed X yet, deadline
 * in <5m"). Dedupe key ensures we don't double-nudge.
 */
export async function sweepEscalations(): Promise<SweepResult> {
  const now = new Date();
  const open = await prisma.escalation.findMany({
    where: { closedAt: null, expiresAt: { lt: now } },
  });
  let promoted = 0;
  let nudgesSent = 0;
  for (const esc of open) {
    // Has the job since been claimed or resolved? Close without promoting.
    const job = await loadJob(esc.jobType as JobType, esc.jobId);
    if (!job) {
      await prisma.escalation.update({
        where: { id: esc.id },
        data: { closedAt: now, outcome: 'job_resolved' },
      });
      continue;
    }
    if (job.resolved || job.figuredOutAt) {
      await prisma.escalation.update({
        where: { id: esc.id },
        data: { closedAt: now, outcome: 'job_resolved' },
      });
      continue;
    }
    if (job.pointPersonId) {
      await prisma.escalation.update({
        where: { id: esc.id },
        data: { closedAt: now, outcome: 'claimed' },
      });
      continue;
    }

    // Real timeout. Close + promote.
    await prisma.escalation.update({
      where: { id: esc.id },
      data: { closedAt: now, outcome: 'timed_out' },
    });

    const nextTier = esc.tier + 1;
    if (nextTier > 3) {
      // Already at max. Just close. Christina will see it on the dashboard.
      continue;
    }

    // Open next tier.
    const nextExpiresAt = new Date(
      now.getTime() + (nextTier === 3 ? 24 * 60 * 60 * 1000 : FIFTEEN_MIN_MS),
    );
    const nextEsc = await prisma.escalation.create({
      data: {
        jobType: esc.jobType, jobId: esc.jobId, tier: nextTier,
        reason: 'no_claim', openedAt: now, expiresAt: nextExpiresAt,
      },
    });
    promoted++;

    // Recompute the candidate roster so we know who's a coordinator etc.
    const candidates = await candidatesForJob(job, now);
    const recipients = await recipientsForTier(nextTier, candidates);
    const dedupePrefix = `dispatch:${esc.jobType}:${esc.jobId}:t${nextTier}`;
    let sent = 0;
    for (const r of recipients) {
      if (!r.phone) continue;
      const res = await sendSms({
        to: r.phone,
        tag: `dispatch_t${nextTier}`,
        dedupeKey: `${dedupePrefix}:${r.id}`,
        body: smsBody({ job, tier: nextTier, isEmergency: false, recipientName: r.name, escalated: true }),
      });
      if (res.ok) sent++;
    }
    await prisma.escalation.update({
      where: { id: nextEsc.id },
      data: { smsFanout: sent },
    });
  }
  // Pre-shift Point Person nudge.
  nudgesSent = await runPreShiftNudges(now);

  return { scanned: open.length, expired: open.length, promoted, nudgesSent };
}

/**
 * Pre-shift Point Person nudge sweep.
 *
 * Fires a one-shot SMS to all coordinators when:
 *   - a job has a deadline within 5 minutes
 *   - no Point Person has claimed it yet
 *   - the job is not resolved or figured-out
 *   - we haven't already nudged for this job (dedupe via SmsLedger key)
 *
 * Christina's spec: "if nobody has claimed Point Person before shifts
 * begin, coordinator gets pinged." 2-min nudge window per her note, but
 * I'm using 5 min as a safety margin since the cron only sweeps every
 * 60s. Tunable via env PRE_SHIFT_NUDGE_MIN.
 */
async function runPreShiftNudges(now: Date): Promise<number> {
  const nudgeMin = Number(process.env.PRE_SHIFT_NUDGE_MIN ?? 5);
  if (!Number.isFinite(nudgeMin) || nudgeMin <= 0) return 0;

  const nudgeWindowEnd = new Date(now.getTime() + nudgeMin * 60 * 1000);

  // Find jobs needing nudge across both types.
  const [rescues, transports] = await Promise.all([
    prisma.rescueCase.findMany({
      where: {
        pointPersonId: null,
        figuredOutAt: null,
        deadline: { gte: now, lte: nudgeWindowEnd },
        status: 'needs_rescue',
        archivedAt: null, deletedAt: null,
      },
      select: { id: true, birdDescription: true, location: true, deadline: true },
    }),
    prisma.transportRequest.findMany({
      where: {
        pointPersonId: null,
        figuredOutAt: null,
        deadline: { gte: now, lte: nudgeWindowEnd },
        status: { in: ['open', 'assigned'] },
      },
      select: { id: true, title: true, type: true, fromAddress: true, deadline: true },
    }),
  ]);

  type Nudgeable = { type: JobType; id: string; title: string; deadline: Date };
  const nudgeable: Nudgeable[] = [
    ...rescues.map(r => ({
      type: 'RescueCase' as JobType, id: r.id, deadline: r.deadline!,
      title: r.birdDescription
        ? `${r.birdDescription}${r.location ? ' @ ' + r.location : ''}`
        : 'Rescue case',
    })),
    ...transports.map(t => ({
      type: 'TransportRequest' as JobType, id: t.id, deadline: t.deadline!,
      title: t.title ?? t.type ?? `Transport${t.fromAddress ? ' from ' + t.fromAddress : ''}`,
    })),
  ];

  if (nudgeable.length === 0) return 0;

  // Get all coordinators.
  const coordinators = await prisma.volunteerProfile.findMany({
    where: { isCoordinator: true, disabledAt: null },
    select: { id: true, name: true, phone: true },
  });

  let sent = 0;
  for (const job of nudgeable) {
    const mins = Math.round((job.deadline.getTime() - now.getTime()) / 60000);
    for (const c of coordinators) {
      if (!c.phone) continue;
      const res = await sendSms({
        to: c.phone,
        tag: 'preshift_nudge',
        // Dedupe key includes the job id only (no timestamp) so the same
        // job only nudges once per 5-min window via the ledger's own
        // dedupe-window check (5 min by default).
        dedupeKey: `nudge:${job.type}:${job.id}:${c.id}`,
        body: `⚠️ Unclaimed: ${job.title}. Deadline in ${mins}m and nobody is Point Person yet.`,
      });
      if (res.ok) sent++;
    }
  }
  return sent;
}

/**
 * Claim a job as Point Person. Atomic: only succeeds if no PP is set
 * (or this is the same volunteer re-claiming).
 *
 * Returns ok:true with role=Point Person. ok:false reasons:
 *   - "not_eligible": volunteer has no Assignment row for this job
 *   - "already_claimed": another volunteer beat them
 *   - "job_resolved": job has been resolved
 */
export type ClaimResult =
  | { ok: true; jobType: JobType; jobId: string; pointPersonId: string }
  | { ok: false; reason: 'not_eligible' | 'already_claimed' | 'job_resolved' };

export async function claimPointPerson(args: {
  jobType: JobType;
  jobId: string;
  profileId: string;
}): Promise<ClaimResult> {
  const { jobType, jobId, profileId } = args;

  // Must have an Assignment row to claim.
  const assignment = await prisma.assignment.findUnique({
    where: { jobType_jobId_profileId: { jobType, jobId, profileId } },
  });
  if (!assignment) return { ok: false, reason: 'not_eligible' };

  const job = await loadJob(jobType, jobId);
  if (!job) return { ok: false, reason: 'job_resolved' };
  if (job.resolved || job.figuredOutAt) return { ok: false, reason: 'job_resolved' };
  if (job.pointPersonId && job.pointPersonId !== profileId) {
    return { ok: false, reason: 'already_claimed' };
  }

  const now = new Date();

  // Atomic update with the null-PP constraint. If another claim raced
  // in between our SELECT and UPDATE, updateMany returns count=0 and
  // we report "already_claimed".
  let updated = 0;
  if (jobType === 'RescueCase') {
    const r = await prisma.rescueCase.updateMany({
      where: { id: jobId, OR: [{ pointPersonId: null }, { pointPersonId: profileId }] },
      data: { pointPersonId: profileId, pointPersonClaimedAt: now },
    });
    updated = r.count;
  } else {
    const r = await prisma.transportRequest.updateMany({
      where: { id: jobId, OR: [{ pointPersonId: null }, { pointPersonId: profileId }] },
      data: { pointPersonId: profileId, pointPersonClaimedAt: now },
    });
    updated = r.count;
  }
  if (updated === 0) return { ok: false, reason: 'already_claimed' };

  // Update Assignment + close open Escalations.
  await prisma.assignment.update({
    where: { jobType_jobId_profileId: { jobType, jobId, profileId } },
    data: { status: 'claimed', claimedAt: now },
  });
  await prisma.escalation.updateMany({
    where: { jobType, jobId, closedAt: null },
    data: { closedAt: now, outcome: 'claimed' },
  });

  // Log point-earning event (small, auto-approved).
  await logEvent({
    profileId,
    category: jobType === 'RescueCase' ? 'rescue' : 'transport',
    kind: jobType === 'RescueCase' ? 'rescue.claim_point_person' : 'transport.claim_point_person',
    pointDelta: 3, // small claim bonus; tunable in Phase 2
    refType: jobType,
    refId: jobId,
  });

  return { ok: true, jobType, jobId, pointPersonId: profileId };
}

/**
 * Mark a volunteer as Unavailable for a specific job. Doesn't affect
 * other volunteers' assignments; doesn't cancel escalations. Logs an
 * audit event so we can compute reliability later.
 */
export async function markUnavailable(args: {
  jobType: JobType;
  jobId: string;
  profileId: string;
}): Promise<{ ok: boolean }> {
  const { jobType, jobId, profileId } = args;
  const r = await prisma.assignment.updateMany({
    where: { jobType, jobId, profileId, status: 'notified' },
    data: { status: 'declined', declinedAt: new Date() },
  });
  if (r.count === 0) return { ok: false };
  await logEvent({
    profileId,
    category: jobType === 'RescueCase' ? 'rescue' : 'transport',
    kind: jobType === 'RescueCase' ? 'rescue.decline' : 'transport.decline',
    pointDelta: 0,
    refType: jobType,
    refId: jobId,
  });
  return { ok: true };
}

/**
 * Tap "Figured Out" -- closes escalations without changing job status.
 * Used by a coordinator or Point Person to say "we got this, stop
 * the fan-out." Doesn't resolve the job; the actual resolution
 * (Rescued, Delivered, etc.) is a separate action.
 */
export async function markFiguredOut(args: {
  jobType: JobType;
  jobId: string;
  profileId: string;
}): Promise<{ ok: boolean }> {
  const { jobType, jobId, profileId } = args;
  const now = new Date();
  if (jobType === 'RescueCase') {
    await prisma.rescueCase.update({ where: { id: jobId }, data: { figuredOutAt: now } });
  } else {
    await prisma.transportRequest.update({ where: { id: jobId }, data: { figuredOutAt: now } });
  }
  await prisma.escalation.updateMany({
    where: { jobType, jobId, closedAt: null },
    data: { closedAt: now, outcome: 'job_resolved' },
  });
  await logEvent({
    profileId,
    category: jobType === 'RescueCase' ? 'rescue' : 'transport',
    kind: `${jobType === 'RescueCase' ? 'rescue' : 'transport'}.figured_out`,
    pointDelta: 0,
    refType: jobType,
    refId: jobId,
  });
  return { ok: true };
}

// ---- internals ----

async function loadJob(jobType: JobType, jobId: string): Promise<JobSummary | null> {
  if (jobType === 'RescueCase') {
    const row = await prisma.rescueCase.findUnique({
      where: { id: jobId },
      select: {
        id: true, status: true, birdDescription: true, issue: true, location: true,
        emergencyFlag: true, deadline: true, pointPersonId: true, figuredOutAt: true,
        deletedAt: true, archivedAt: true,
      },
    });
    if (!row) return null;
    const resolved = ['rescued', 'escaped_flew_away', 'closed_unable'].includes(row.status) ||
                     !!row.deletedAt || !!row.archivedAt;
    return {
      id: row.id, type: 'RescueCase',
      title: `Rescue: ${row.birdDescription ?? 'bird'} at ${row.location ?? 'unknown'}`,
      emergencyFlag: row.emergencyFlag,
      deadline: row.deadline,
      pointPersonId: row.pointPersonId,
      figuredOutAt: row.figuredOutAt,
      resolved,
      eligibleRoles: ['rescue', 'rescue_lead'],
    };
  }
  const row = await prisma.transportRequest.findUnique({
    where: { id: jobId },
    select: {
      id: true, status: true, title: true, type: true, fromAddress: true,
      toAddress: true, pickupBy: true, deliverBy: true,
      emergencyFlag: true, deadline: true, pointPersonId: true, figuredOutAt: true,
    },
  });
  if (!row) return null;
  const resolved = ['delivered', 'cancelled'].includes(row.status);
  return {
    id: row.id, type: 'TransportRequest',
    title: `Transport: ${row.title ?? row.type ?? 'pickup'} ${row.fromAddress ? '@ ' + row.fromAddress : ''}`.trim(),
    emergencyFlag: row.emergencyFlag,
    deadline: row.deadline ?? row.deliverBy ?? row.pickupBy,
    pointPersonId: row.pointPersonId,
    figuredOutAt: row.figuredOutAt,
    resolved,
    eligibleRoles: ['transport'],
  };
}

type Candidate = {
  id: string;
  name: string;
  phone: string | null;
  isCoordinator: boolean;
  roleTags: string;
};

async function candidatesForJob(job: JobSummary, when: Date): Promise<Candidate[]> {
  // All non-disabled volunteers, role-filtered + availability-filtered.
  const profiles = await prisma.volunteerProfile.findMany({
    where: { disabledAt: null },
    select: {
      id: true, name: true, phone: true, isCoordinator: true, roleTags: true,
      availability: true,
    },
  });
  const out: Candidate[] = [];
  for (const p of profiles) {
    if (!hasAnyRole(p.roleTags, job.eligibleRoles)) continue;
    if (!isAvailableAt(p.availability, when, job.type)) continue;
    out.push({
      id: p.id, name: p.name, phone: p.phone,
      isCoordinator: p.isCoordinator, roleTags: p.roleTags,
    });
  }
  return out;
}

import { expandRange } from '@/lib/scheduling';

function isAvailableAt(
  blocks: { id: string; kind: string; scope: string; startsAt: Date; endsAt: Date; rrule: string | null; effectiveUntil: Date | null }[],
  when: Date,
  jobType: JobType,
): boolean {
  const wantScope = jobType === 'RescueCase' ? 'rescue' : 'transport';
  for (const b of blocks) {
    if (b.scope !== 'any' && b.scope !== wantScope) continue;
    if (b.kind === 'always') return true;
    if (b.effectiveUntil && b.effectiveUntil < when) continue;
    if (b.kind === 'one_time') {
      if (b.startsAt <= when && b.endsAt >= when) return true;
      continue;
    }
    // weekly / indefinite / custom -> expand around `when` to check overlap
    const dayStart = new Date(when.getTime() - 24 * 60 * 60 * 1000);
    const dayEnd   = new Date(when.getTime() + 24 * 60 * 60 * 1000);
    const occs = expandRange([b], dayStart, dayEnd);
    if (occs.some(o => o.occurrenceStartsAt <= when && o.occurrenceEndsAt >= when)) {
      return true;
    }
  }
  return false;
}

async function recipientsForTier(tier: number, candidates: Candidate[]): Promise<Candidate[]> {
  if (tier === 1) {
    // Every assigned candidate -- coordinator-volunteers included.
    // Being a coordinator doesn't suppress on-shift notifications.
    return candidates;
  }
  if (tier === 2) {
    // All coordinators who weren't already in the T1 candidate set.
    // A coordinator-volunteer who got T1 doesn't need T2 (they already
    // know). The non-candidate coordinators get pinged here.
    const candidateIds = new Set(candidates.map(c => c.id));
    const allCoords = await prisma.volunteerProfile.findMany({
      where: { isCoordinator: true, disabledAt: null },
      select: { id: true, name: true, phone: true, isCoordinator: true, roleTags: true },
    });
    return allCoords.filter(c => !candidateIds.has(c.id));
  }
  // tier 3: Christina specifically. We resolve in priority order:
  //   1. VolunteerProfile with email = CHRISTINA_EMAIL (env), or
  //      falling back to the canonical "christina@cascadiapigeonrescue.org"
  //   2. Env-only synthetic recipient with CHRISTINA_PHONE
  // This way Christina's phone updates flow through the admin volunteer
  // edit UI -- no need to touch env after the initial wiring.
  const expectedEmail = (process.env.CHRISTINA_EMAIL || 'christina@cascadiapigeonrescue.org').toLowerCase();
  const profile = await prisma.volunteerProfile.findUnique({
    where: { email: expectedEmail },
    select: { id: true, name: true, phone: true, isCoordinator: true, roleTags: true, disabledAt: true },
  });
  if (profile && !profile.disabledAt) {
    return [{ id: profile.id, name: profile.name, phone: profile.phone,
              isCoordinator: profile.isCoordinator, roleTags: profile.roleTags }];
  }
  // Fallback: env-only.
  const fallbackPhone = process.env.CHRISTINA_PHONE || null;
  if (!fallbackPhone) return [];
  return [{
    id: 'christina',
    name: 'Christina',
    phone: fallbackPhone,
    isCoordinator: true,
    roleTags: 'coordinator',
  }];
}

function smsBody(args: {
  job: JobSummary;
  tier: number;
  isEmergency: boolean;
  recipientName: string;
  escalated?: boolean;
}): string {
  const { job, tier, isEmergency, recipientName, escalated } = args;
  const prefix = isEmergency
    ? '\ud83d\udea8 EMERGENCY'
    : escalated
    ? `\u26a0\ufe0f  ESCALATED (T${tier})`
    : `CPR (T${tier})`;
  const deadlineStr = job.deadline
    ? ` - by ${job.deadline.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
    : '';
  return `${prefix}: ${job.title}${deadlineStr}. ` +
    `Open the portal to claim or decline.`;
}
