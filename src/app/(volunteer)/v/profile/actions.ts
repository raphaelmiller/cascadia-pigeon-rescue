'use server';

// /v/profile server actions.
//
// What a volunteer can self-edit:
//   - their displayed name
//   - their phone number (E.164 if they want SMS to actually work)
//   - vehicle type + max distance (if they have a transport role)
//   - rescue skills (if they have a rescue role)
//
// What they CAN'T self-edit:
//   - email -- it's the sign-in key. Email changes go through a
//     coordinator request flow that logs a VolunteerEvent for the
//     coordinator to act on in the admin app.
//   - role tags / isCoordinator -- only an admin can grant/revoke roles.
//
// All writes happen inside prisma.$transaction so partial failures roll
// back cleanly (we update across VolunteerProfile + the role-table FKs).

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/volunteer/events';

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? '').trim();
}

function nullIfEmpty(v: string): string | null {
  return v.length === 0 ? null : v;
}

function intOrNull(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function saveProfile(formData: FormData): Promise<void> {
  const v = await requireVolunteer();

  const name = s(formData, 'name');
  const phone = nullIfEmpty(s(formData, 'phone'));
  const vehicleType = nullIfEmpty(s(formData, 'vehicleType'));
  const maxDistanceMi = intOrNull(s(formData, 'maxDistanceMi'));
  const transportLocation = nullIfEmpty(s(formData, 'transportLocation'));
  const rescueSkills = nullIfEmpty(s(formData, 'rescueSkills'));
  const rescueLocation = nullIfEmpty(s(formData, 'rescueLocation'));
  const emergencyResponseRaw = formData.get('emergencyResponse');
  const emergencyResponse = emergencyResponseRaw === '1';

  if (!name || name.length < 2) {
    redirect('/profile?msg=invalid_name');
  }

  const digestEnabled = formData.get('digestEnabled') === '1';

  await prisma.$transaction(async (tx) => {
    await tx.volunteerProfile.update({
      where: { id: v.profileId },
      data: { name, phone, digestEnabled },
    });

    // Mirror name/phone to the linked role rows so admin pages reflect
    // the change too. (Same person, two records that historically lived
    // separately -- when one updates, both should.)
    if (v.fosterId) {
      await tx.foster.update({
        where: { id: v.fosterId },
        data: { name, phone },
      });
    }
    if (v.transportId) {
      await tx.transportVolunteer.update({
        where: { id: v.transportId },
        data: {
          name, phone,
          vehicleType,
          maxDistanceMi,
          location: transportLocation,
        },
      });
    }
    if (v.rescueId) {
      await tx.rescueVolunteer.update({
        where: { id: v.rescueId },
        data: {
          name, phone,
          skills: rescueSkills,
          location: rescueLocation,
          emergencyResponse,
        },
      });
    }
  });

  await logEvent({
    profileId: v.profileId,
    category: 'admin',
    kind: 'profile.self_edit',
    pointDelta: 0,
  });

  revalidatePath('/profile');
  redirect('/profile?msg=saved');
}

export async function requestEmailChange(formData: FormData): Promise<void> {
  const v = await requireVolunteer();
  const proposed = s(formData, 'newEmail').toLowerCase();
  if (!proposed || !proposed.includes('@')) {
    redirect('/profile?msg=invalid_email');
  }
  // We don't change anything; we record the request as an admin-actionable
  // event. Coordinators see this in the future approval queue (Phase 2)
  // and meanwhile can spot it via the audit log.
  await logEvent({
    profileId: v.profileId,
    category: 'admin',
    kind: 'profile.email_change_requested',
    pointDelta: 0,
    notes: `Requested ${v.email} -> ${proposed}`,
    approvalStatus: 'pending',
  });
  redirect('/profile?msg=email_requested');
}
