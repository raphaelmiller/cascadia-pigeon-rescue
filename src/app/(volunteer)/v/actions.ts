'use server';

// Server actions for the volunteer portal dispatch UI.
//
// Pattern: each action reads requireVolunteer() at the top to verify
// identity, calls the corresponding dispatch.ts primitive, then
// revalidates the page. Error UX is "redirect with a ?msg= query so
// the page can render a banner" -- consistent with the admin app.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { claimPointPerson, markUnavailable, markFiguredOut, type JobType } from '@/lib/volunteer/dispatch';
import {
  resolveJob,
  passUnable,
  reverseResolution,
  setStandby,
  takeoverPointPerson,
  type RescueResolution,
  type TransportResolution,
} from '@/lib/volunteer/job-resolution';
import { prisma } from '@/lib/prisma';
import { saveUploads } from '@/lib/uploads';
import { logEvent } from '@/lib/volunteer/events';

type FD = FormData;

function jobFromForm(fd: FD): { jobType: JobType; jobId: string } {
  const jobType = String(fd.get('jobType') ?? '') as JobType;
  const jobId = String(fd.get('jobId') ?? '').trim();
  if ((jobType !== 'RescueCase' && jobType !== 'TransportRequest') || !jobId) {
    throw new Error('Invalid job reference');
  }
  return { jobType, jobId };
}

export async function claimPointPersonAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  const result = await claimPointPerson({ jobType, jobId, profileId: v.profileId });
  if (!result.ok) {
    redirect(`/?msg=${encodeURIComponent('claim_failed:' + result.reason)}`);
  }
  revalidatePath('/');
  redirect(`/?msg=${encodeURIComponent('claimed')}`);
}

export async function declineAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  await markUnavailable({ jobType, jobId, profileId: v.profileId });
  revalidatePath('/');
  redirect('/?msg=declined');
}

export async function figuredOutAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  await markFiguredOut({ jobType, jobId, profileId: v.profileId });
  revalidatePath('/');
  redirect('/?msg=figured_out');
}

// Status transitions -- only allowed for the current Point Person on
// the job. Defense-in-depth: we verify in the action AND the buttons
// only render when pointPersonIsMe.
//
// PR H (2026-05-24): 'closed_unable' is no longer reachable through
// this action. The volunteer-side "Unable to rescue" button now calls
// `passUnableAction` which routes through `passUnable()` — escalation,
// not termination.
export async function resolveJobAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  const resolution = String(fd.get('resolution') ?? '').trim();
  if (!resolution) redirect('/?msg=invalid_resolution');

  // Volunteers cannot terminally close a rescue as "unable" — that path
  // now requires admin override.
  if (jobType === 'RescueCase' && resolution === 'closed_unable') {
    redirect('/?msg=unable_use_pass');
  }

  // Verify the actor is the Point Person.
  let pointPersonId: string | null = null;
  if (jobType === 'RescueCase') {
    const job = await prisma.rescueCase.findUnique({
      where: { id: jobId },
      select: { pointPersonId: true },
    });
    pointPersonId = job?.pointPersonId ?? null;
  } else {
    const job = await prisma.transportRequest.findUnique({
      where: { id: jobId },
      select: { pointPersonId: true },
    });
    pointPersonId = job?.pointPersonId ?? null;
  }
  if (pointPersonId !== v.profileId) {
    redirect('/?msg=not_point_person');
  }

  const result = await resolveJob({
    jobType,
    jobId,
    resolution: resolution as RescueResolution | TransportResolution,
    actorProfileId: v.profileId,
  });
  if (!result.ok) {
    redirect(`/?msg=resolve_failed:${result.reason}`);
  }
  revalidatePath('/');
  revalidatePath('/rescue');
  revalidatePath('/transport');
  redirect(`/?msg=resolved:${result.newStatus}:${result.pointsAwarded}`);
}

// PR H: "Unable to rescue" — passes the case back to the dispatch pool
// rather than closing it. Requires a reason (so the next volunteer +
// coordinators have context). Worth +1 pt for showing up + being honest.
export async function passUnableAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const jobId = String(fd.get('jobId') ?? '').trim();
  const reason = String(fd.get('reason') ?? '').trim();
  if (!jobId) redirect('/?msg=invalid');
  if (!reason) redirect(`/rescue/case/${jobId}?msg=unable_needs_reason`);

  const result = await passUnable({ jobId, actorProfileId: v.profileId, reason });
  if (!result.ok) {
    redirect(`/?msg=unable_failed:${result.reason}`);
  }
  revalidatePath('/');
  revalidatePath('/rescue');
  redirect(`/?msg=unable_passed:${result.passedCount}${result.tier2Opened ? ':escalated' : ''}`);
}

// PR H: undo a resolution. Available to:
//   - The original resolver, within UNDO_WINDOW_HOURS (24h)
//   - Any coordinator (admin override) — uses adminUndoResolutionAction below.
export async function undoResolutionAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  const reason = String(fd.get('reason') ?? '').trim();

  const result = await reverseResolution({
    jobType,
    jobId,
    actorProfileId: v.profileId,
    reason,
  });
  if (!result.ok) {
    redirect(`/?msg=undo_failed:${result.reason}`);
  }
  revalidatePath('/');
  revalidatePath('/rescue');
  revalidatePath('/transport');
  redirect(`/?msg=undone:${result.newStatus}`);
}

// PR H: Add a volunteer field-note + optional photos to a rescue case.
// Points:
//   - +1 per note (capped 1 per rescue resolution cycle)
//   - +2 per photo (capped at 4 photos)
//   - hard ceiling +5 points per case
// Encourages volunteers to leave context for the next responder + give
// CPR social media content without farming.
const NOTE_POINTS = 1;
const PHOTO_POINTS = 2;
const POINTS_CEILING_PER_CASE = 5;
const POINTS_KIND_NOTE = 'rescue.field_note';
const POINTS_KIND_PHOTO = 'rescue.field_photo';

export async function addRescueNoteAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const jobId = String(fd.get('jobId') ?? '').trim();
  const text = String(fd.get('text') ?? '').trim();
  const photoFiles = fd.getAll('photos');
  if (!jobId) redirect('/?msg=invalid');
  if (!text && photoFiles.length === 0) {
    redirect(`/rescue/case/${jobId}?msg=note_empty`);
  }

  // Verify the actor has an Assignment on this case (or is the PP).
  // We don't restrict to PP only — any volunteer who was paged on this
  // case can drop notes/photos.
  const involvement = await prisma.assignment.findFirst({
    where: { jobType: 'RescueCase', jobId, profileId: v.profileId },
    select: { id: true },
  });
  if (!involvement) {
    redirect('/?msg=note_forbidden');
  }

  // Save photos first (don't take the points hit if upload fails).
  let savedPhotos: Awaited<ReturnType<typeof saveUploads>> = [];
  if (photoFiles.length > 0) {
    savedPhotos = await saveUploads(photoFiles, 'rescue-cases', { allow: 'image' });
  }

  await prisma.$transaction(async (tx) => {
    if (text) {
      await tx.rescueCaseUpdate.create({
        data: {
          caseId: jobId,
          text,
          category: 'volunteer_note',
          authorProfileId: v.profileId,
        },
      });
    }
    if (savedPhotos.length > 0) {
      await tx.rescueCasePhoto.createMany({
        data: savedPhotos.map(s => ({ caseId: jobId, url: s.url, caption: null })),
      });
    }
  });

  // Compute remaining points budget for this volunteer × case so we
  // don't blow the ceiling.
  const prior = await prisma.volunteerEvent.aggregate({
    where: {
      profileId: v.profileId,
      refType: 'RescueCase',
      refId: jobId,
      kind: { in: [POINTS_KIND_NOTE, POINTS_KIND_PHOTO] },
      reversedAt: null,
    },
    _sum: { pointDelta: true },
  });
  let used = prior._sum.pointDelta ?? 0;
  let budget = Math.max(0, POINTS_CEILING_PER_CASE - used);

  if (text && budget >= NOTE_POINTS) {
    await logEvent({
      profileId: v.profileId,
      category: 'rescue',
      kind: POINTS_KIND_NOTE,
      pointDelta: NOTE_POINTS,
      refType: 'RescueCase',
      refId: jobId,
      notes: text.slice(0, 200),
    });
    budget -= NOTE_POINTS;
    used += NOTE_POINTS;
  }
  for (let i = 0; i < Math.min(savedPhotos.length, 4); i++) {
    if (budget < PHOTO_POINTS) break;
    await logEvent({
      profileId: v.profileId,
      category: 'rescue',
      kind: POINTS_KIND_PHOTO,
      pointDelta: PHOTO_POINTS,
      refType: 'RescueCase',
      refId: jobId,
    });
    budget -= PHOTO_POINTS;
  }

  revalidatePath('/');
  revalidatePath('/rescue');
  redirect(`/rescue/case/${jobId}?msg=note_added`);
}

// PR I (2026-05-24): toggle "I can back up" standby for a paged non-PP
// volunteer. The assignment stays in their feed; this just flags them as
// actively following the case so they show up in the avatar stack +
// unlock the take-over button once the heartbeat threshold passes.
export async function toggleStandbyAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  const standing_by = String(fd.get('standby') ?? '1') === '1';
  const result = await setStandby({ jobType, jobId, actorProfileId: v.profileId, standing_by });
  const back = jobType === 'RescueCase' ? `/rescue/case/${jobId}` : '/';
  if (!result.ok) {
    redirect(`${back}?msg=standby_failed:${result.reason}`);
  }
  revalidatePath('/');
  revalidatePath(back);
  redirect(`${back}?msg=${standing_by ? 'standby_on' : 'standby_off'}`);
}

// PR I: take over as Point Person. Threshold-gated (emergency = 10 min idle,
// routine = 20 min idle). Coordinators bypass the threshold.
export async function takeoverAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const jobId = String(fd.get('jobId') ?? '').trim();
  if (!jobId) redirect('/?msg=invalid');
  const result = await takeoverPointPerson({
    jobId,
    actorProfileId: v.profileId,
    isCoordinator: v.isCoordinator,
  });
  const back = `/rescue/case/${jobId}`;
  if (!result.ok) {
    redirect(`${back}?msg=takeover_failed:${result.reason}`);
  }
  revalidatePath('/');
  revalidatePath('/rescue');
  revalidatePath(back);
  redirect(`${back}?msg=took_over`);
}
