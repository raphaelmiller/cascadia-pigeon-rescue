'use server';

import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { parseBlockForm } from '@/lib/scheduling-actions';

export type SaveResult = { ok: boolean; warnings?: string[]; error?: string };

export async function saveTransportAvailability(fd: FormData): Promise<SaveResult> {
  await requireOperator();
  let block;
  try {
    block = parseBlockForm(fd);
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
  if (!block.volunteerId) {
    return { ok: false, error: 'Pick a driver to assign this availability block to.' };
  }
  if (block.id) {
    await prisma.transportAvailability.update({
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
    await prisma.transportAvailability.create({
      data: {
        volunteerId: block.volunteerId,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        rrule: block.rrule,
        notes: block.notes,
      },
    });
  }
  revalidatePath('/transport/availability');
  if (block.volunteerId) revalidatePath(`/transport/drivers/${block.volunteerId}/availability`);
  return { ok: true };
}

export async function deleteTransportAvailability(id: string): Promise<SaveResult> {
  await requireOperator();
  if (!id) return { ok: false, error: 'Missing id.' };
  const row = await prisma.transportAvailability.findUnique({ where: { id }, select: { volunteerId: true } });
  await prisma.transportAvailability.delete({ where: { id } });
  revalidatePath('/transport/availability');
  if (row?.volunteerId) revalidatePath(`/transport/drivers/${row.volunteerId}/availability`);
  return { ok: true };
}
