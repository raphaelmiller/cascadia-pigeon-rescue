'use server';

// Admin actions for managing VolunteerProfile records.
//
// All actions require admin auth via requireOperator(). VolunteerProfile
// is intentionally distinct from the legacy role tables (Foster /
// TransportVolunteer / RescueVolunteer) -- a VolunteerProfile is the
// IDENTITY record (portal login + phone + role tags), and it can
// optionally point at one or more role-table records for the per-role
// data (vehicle, skills, capacity, etc.).
//
// On create, we attempt to auto-link role-table records that match the
// email. Christina can override the link manually if needed.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { ROLE_TAGS, type RoleTag, serializeRoleTags } from '@/lib/volunteer/roles';

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? '').trim();
}

function readRoleTags(fd: FormData): string {
  // Checkboxes -- each role tag is sent as its own form key when checked.
  const tags: RoleTag[] = [];
  for (const t of ROLE_TAGS) {
    if (fd.get(`role_${t}`)) tags.push(t);
  }
  return serializeRoleTags(tags);
}

export async function createVolunteerProfile(formData: FormData): Promise<void> {
  await requireOperator();
  const name = s(formData, 'name');
  const email = s(formData, 'email').toLowerCase();
  const phone = s(formData, 'phone');
  const roleTags = readRoleTags(formData);
  const isCoordinator = formData.get('isCoordinator') === '1';

  if (!name || !email || !email.includes('@')) {
    redirect('/volunteers?msg=invalid_input');
  }

  // Email collision check.
  const dup = await prisma.volunteerProfile.findUnique({ where: { email } });
  if (dup) redirect('/volunteers?msg=email_in_use');

  // Auto-link to existing role-table records by email.
  const [foster, transport, rescue] = await Promise.all([
    prisma.foster.findFirst({ where: { email } }),
    prisma.transportVolunteer.findFirst({ where: { email } }),
    prisma.rescueVolunteer.findFirst({ where: { email } }),
  ]);

  await prisma.volunteerProfile.create({
    data: {
      name, email,
      phone: phone || null,
      roleTags,
      isCoordinator,
      invitedAt: new Date(),
      fosterId: foster?.id ?? null,
      transportId: transport?.id ?? null,
      rescueId: rescue?.id ?? null,
    },
  });

  revalidatePath('/volunteers');
  redirect('/volunteers?msg=created');
}

export async function updateVolunteerProfile(formData: FormData): Promise<void> {
  await requireOperator();
  const id = s(formData, 'id');
  if (!id) redirect('/volunteers');

  const name = s(formData, 'name');
  const phone = s(formData, 'phone');
  const roleTags = readRoleTags(formData);
  const isCoordinator = formData.get('isCoordinator') === '1';

  if (!name) redirect(`/volunteers/${id}?msg=invalid_name`);

  await prisma.volunteerProfile.update({
    where: { id },
    data: {
      name,
      phone: phone || null,
      roleTags,
      isCoordinator,
    },
  });
  revalidatePath('/volunteers');
  revalidatePath(`/volunteers/${id}`);
  redirect(`/volunteers/${id}?msg=saved`);
}

export async function setDisabled(formData: FormData): Promise<void> {
  await requireOperator();
  const id = s(formData, 'id');
  const action = s(formData, 'action'); // 'disable' | 'enable'
  if (!id) redirect('/volunteers');
  await prisma.volunteerProfile.update({
    where: { id },
    data: { disabledAt: action === 'disable' ? new Date() : null },
  });
  revalidatePath('/volunteers');
  revalidatePath(`/volunteers/${id}`);
  redirect(`/volunteers/${id}?msg=${action === 'disable' ? 'disabled' : 'enabled'}`);
}

export async function relinkRoleRecord(formData: FormData): Promise<void> {
  await requireOperator();
  const id = s(formData, 'id');
  const kind = s(formData, 'kind'); // 'foster' | 'transport' | 'rescue'
  const targetId = s(formData, 'targetId') || null;
  if (!id) redirect('/volunteers');
  const data: Record<string, string | null> = {};
  if (kind === 'foster') data.fosterId = targetId;
  else if (kind === 'transport') data.transportId = targetId;
  else if (kind === 'rescue') data.rescueId = targetId;
  else redirect(`/volunteers/${id}?msg=invalid_kind`);

  await prisma.volunteerProfile.update({ where: { id }, data });
  revalidatePath(`/volunteers/${id}`);
  redirect(`/volunteers/${id}?msg=relinked`);
}
