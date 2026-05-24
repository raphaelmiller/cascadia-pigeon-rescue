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
import { resolveJob, type RescueResolution, type TransportResolution } from '@/lib/volunteer/job-resolution';
import { prisma } from '@/lib/prisma';

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
export async function resolveJobAction(fd: FD): Promise<void> {
  const v = await requireVolunteer();
  const { jobType, jobId } = jobFromForm(fd);
  const resolution = String(fd.get('resolution') ?? '').trim();
  if (!resolution) redirect('/?msg=invalid_resolution');

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
