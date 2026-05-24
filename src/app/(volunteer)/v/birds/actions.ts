'use server';

// Foster check-in server action. Logs a FosterCheckIn row + a +1 point
// VolunteerEvent. Per Christina's spec: "make it not a problem if they
// don't check in when nothing's wrong, but DO reward them with a point
// every time they do."

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAnyRole } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/volunteer/events';

const VALID_PULSES = ['all_good', 'watching', 'concern'] as const;

export async function submitCheckIn(formData: FormData): Promise<void> {
  const v = await requireAnyRole(['foster', 'lead_foster', 'med_admin']);

  const pulseRaw = String(formData.get('pulse') ?? 'all_good');
  const pulse = (VALID_PULSES as readonly string[]).includes(pulseRaw) ? pulseRaw : 'all_good';
  const birdId = String(formData.get('birdId') ?? '').trim() || null;
  const note = String(formData.get('note') ?? '').trim() || null;

  // If a birdId was provided, ensure it's actually one of THIS volunteer's
  // birds. Defense in depth -- the form only lists their own birds, but
  // a curious volunteer with DevTools shouldn't be able to check in on
  // someone else's bird.
  if (birdId && v.fosterId) {
    const bird = await prisma.bird.findUnique({
      where: { id: birdId },
      select: { fosterId: true },
    });
    if (!bird || bird.fosterId !== v.fosterId) {
      redirect('/birds?msg=forbidden');
    }
  }

  await prisma.fosterCheckIn.create({
    data: { profileId: v.profileId, birdId, pulse, note },
  });

  await logEvent({
    profileId: v.profileId,
    category: 'check_in',
    kind: 'foster.check_in',
    pointDelta: 1,
    refType: birdId ? 'Bird' : undefined,
    refId: birdId ?? undefined,
    notes: note ? note.slice(0, 200) : undefined,
  });

  revalidatePath('/birds');
  redirect('/birds?msg=checked_in');
}
