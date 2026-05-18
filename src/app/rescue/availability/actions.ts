'use server';

import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { parseBlockForm } from '@/lib/scheduling-actions';

export type SaveResult = { ok: boolean; warnings?: string[]; error?: string };

export async function saveRescueAvailability(fd: FormData): Promise<SaveResult> {
  await requireOperator();
  let block;
  try {
    block = parseBlockForm(fd);
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
  if (!block.volunteerId) {
    return { ok: false, error: 'Pick a rescuer to assign this availability block to.' };
  }
  if (block.id) {
    await prisma.rescueAvailability.update({
      where: { id: block.id },
      data: {
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        rrule: block.rrule,
        notes: block.notes,
        volunteerId: block.volunteerId,
      },
    });
  } else {
    await prisma.rescueAvailability.create({
      data: {
        volunteerId: block.volunteerId,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        rrule: block.rrule,
        notes: block.notes,
      },
    });
  }
  revalidatePath('/rescue/availability');
  if (block.volunteerId) revalidatePath(`/rescue/rescuers/${block.volunteerId}/availability`);
  return { ok: true };
}

export async function deleteRescueAvailability(id: string): Promise<SaveResult> {
  await requireOperator();
  if (!id) return { ok: false, error: 'Missing id.' };
  const row = await prisma.rescueAvailability.findUnique({ where: { id }, select: { volunteerId: true } });
  await prisma.rescueAvailability.delete({ where: { id } });
  revalidatePath('/rescue/availability');
  if (row?.volunteerId) revalidatePath(`/rescue/rescuers/${row.volunteerId}/availability`);
  return { ok: true };
}
