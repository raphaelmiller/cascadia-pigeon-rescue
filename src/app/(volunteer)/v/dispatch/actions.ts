'use server';

// Coordinator-only actions on the dispatch board.
//
// Every action verifies the actor is a coordinator (defense-in-depth
// beyond the page-level role check) before proceeding.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { dispatchJob, claimPointPerson, type JobType } from '@/lib/volunteer/dispatch';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/volunteer/events';

function jobFromForm(fd: FormData): { jobType: JobType; jobId: string } {
  const jobType = String(fd.get('jobType') ?? '') as JobType;
  const jobId = String(fd.get('jobId') ?? '').trim();
  if ((jobType !== 'RescueCase' && jobType !== 'TransportRequest') || !jobId) {
    throw new Error('Invalid job reference');
  }
  return { jobType, jobId };
}

export async function redispatchAction(fd: FormData): Promise<void> {
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/dispatch?msg=forbidden');
  const { jobType, jobId } = jobFromForm(fd);

  await dispatchJob(jobType, jobId, { reason: 'manual' });
  await logEvent({
    profileId: v.profileId,
    category: 'admin',
    kind: 'dispatch.redispatched',
    pointDelta: 0,
    refType: jobType,
    refId: jobId,
  });
  revalidatePath('/dispatch');
  redirect('/dispatch?msg=redispatched');
}

/**
 * Coordinator manually assigns a Point Person on behalf of a volunteer.
 * This is the "I just talked to Theo on the phone, he's taking it" path.
 */
export async function manualClaimAction(fd: FormData): Promise<void> {
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/dispatch?msg=forbidden');
  const { jobType, jobId } = jobFromForm(fd);
  const targetProfileId = String(fd.get('targetProfileId') ?? '').trim();
  if (!targetProfileId) redirect('/dispatch?msg=invalid_target');

  // Make sure the target has an Assignment row. If not, create one --
  // a coordinator can pull in anyone with the right role even if they
  // weren't auto-assigned (e.g. their availability didn't cover NOW).
  const existing = await prisma.assignment.findUnique({
    where: { jobType_jobId_profileId: { jobType, jobId, profileId: targetProfileId } },
  });
  if (!existing) {
    await prisma.assignment.create({
      data: { jobType, jobId, profileId: targetProfileId, source: 'manual' },
    });
  }

  const result = await claimPointPerson({ jobType, jobId, profileId: targetProfileId });
  if (!result.ok) {
    redirect(`/dispatch?msg=manual_claim_failed:${result.reason}`);
  }
  await logEvent({
    profileId: v.profileId,
    category: 'admin',
    kind: 'dispatch.manual_claim',
    pointDelta: 0,
    refType: jobType,
    refId: jobId,
    notes: `Manually assigned to profile ${targetProfileId}`,
  });
  revalidatePath('/dispatch');
  redirect('/dispatch?msg=manual_claimed');
}

/**
 * Force-escalate to the next tier without waiting for the timer.
 * Closes the current tier with outcome="superseded" and opens the next.
 * Used when a coordinator knows the current tier isn't going to claim
 * (e.g. all 4 volunteers are out of pocket for the next hour).
 */
export async function forceEscalateAction(fd: FormData): Promise<void> {
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/dispatch?msg=forbidden');
  const { jobType, jobId } = jobFromForm(fd);
  const now = new Date();

  // Find current open escalation (highest tier).
  const open = await prisma.escalation.findMany({
    where: { jobType, jobId, closedAt: null },
    orderBy: { tier: 'desc' },
  });
  if (open.length === 0) {
    // No open escalation; re-dispatch instead.
    await dispatchJob(jobType, jobId, { reason: 'manual' });
    revalidatePath('/dispatch');
    redirect('/dispatch?msg=redispatched');
  }
  const current = open[0];
  const nextTier = current.tier + 1;
  if (nextTier > 3) {
    redirect('/dispatch?msg=already_max_tier');
  }

  // Close current, open next.
  await prisma.escalation.update({
    where: { id: current.id },
    data: { closedAt: now, outcome: 'superseded' },
  });

  // Use the dispatch primitive to fan-out the next tier. We do this by
  // calling dispatchJob, but dispatchJob is idempotent on tiers (it
  // checks for already-open escalations before opening). Since we just
  // closed the current tier, dispatchJob will see no open escalation
  // and open tier 1... which isn't what we want. Best path: open the
  // next tier manually + fan out SMS via the sweep path.
  //
  // Cleaner: import the recipients-for-tier helper from dispatch.ts.
  // But that's not exported. Quickest: open the row + let the next
  // sweep handle SMS. For Phase 1.5, that's acceptable -- the cron
  // sweep is supposed to run every 60s.
  await prisma.escalation.create({
    data: {
      jobType, jobId, tier: nextTier,
      reason: 'manual',
      openedAt: now,
      expiresAt: new Date(now.getTime() + (nextTier === 3 ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000)),
    },
  });

  await logEvent({
    profileId: v.profileId,
    category: 'admin',
    kind: 'dispatch.force_escalated',
    pointDelta: 0,
    refType: jobType,
    refId: jobId,
    notes: `Forced ${current.tier} -> ${nextTier}`,
  });
  revalidatePath('/dispatch');
  redirect(`/dispatch?msg=escalated:${nextTier}`);
}

/**
 * Pending-review approve / reject. Mutates the VolunteerEvent +
 * possibly the underlying record (e.g. for email-change events, it
 * actually swaps the profile email).
 */
export async function approvePendingAction(fd: FormData): Promise<void> {
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/dispatch?msg=forbidden');
  const eventId = String(fd.get('eventId') ?? '').trim();
  if (!eventId) redirect('/dispatch');
  const ev = await prisma.volunteerEvent.findUnique({ where: { id: eventId } });
  if (!ev || ev.approvalStatus !== 'pending') {
    redirect('/dispatch?msg=review_already_handled');
  }

  // Kind-specific approval semantics.
  if (ev.kind === 'profile.email_change_requested' && ev.notes) {
    // Notes look like: "Requested old@ex.com -> new@ex.com"
    const m = ev.notes.match(/->\s+(\S+@\S+)/);
    const proposed = m ? m[1].toLowerCase() : null;
    if (proposed) {
      // Check it's not in use.
      const conflict = await prisma.volunteerProfile.findUnique({ where: { email: proposed } });
      if (conflict && conflict.id !== ev.profileId) {
        redirect('/dispatch?msg=email_in_use');
      }
      await prisma.volunteerProfile.update({
        where: { id: ev.profileId },
        data: { email: proposed },
      });
    }
  }

  await prisma.volunteerEvent.update({
    where: { id: eventId },
    data: { approvalStatus: 'approved', approvedById: v.profileId, approvedAt: new Date() },
  });
  revalidatePath('/dispatch');
  redirect('/dispatch?msg=review_approved');
}

export async function rejectPendingAction(fd: FormData): Promise<void> {
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/dispatch?msg=forbidden');
  const eventId = String(fd.get('eventId') ?? '').trim();
  if (!eventId) redirect('/dispatch');
  await prisma.volunteerEvent.update({
    where: { id: eventId },
    data: { approvalStatus: 'rejected', approvedById: v.profileId, approvedAt: new Date() },
  });
  revalidatePath('/dispatch');
  redirect('/dispatch?msg=review_rejected');
}
