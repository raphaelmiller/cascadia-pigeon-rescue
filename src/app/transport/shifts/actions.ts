'use server';

import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { parseBlockForm, runShiftConflictCheck } from '@/lib/scheduling-actions';

export type SaveResult = { ok: boolean; warnings?: string[]; error?: string };

export async function saveTransportShift(fd: FormData): Promise<SaveResult> {
  await requireOperator();
  let block;
  try {
    block = parseBlockForm(fd);
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }

  // Conflict check (warn-only).
  let warnings: string[] = [];
  if (block.volunteerId) {
    const driver = await prisma.transportVolunteer.findUnique({
      where: { id: block.volunteerId }, select: { name: true },
    });
    if (!driver) return { ok: false, error: 'Driver not found.' };
    warnings = await runShiftConflictCheck({
      block,
      assigneeName: driver.name,
      loadAvailabilities: async () =>
        prisma.transportAvailability.findMany({
          where: { volunteerId: block.volunteerId! },
          select: { id: true, startsAt: true, endsAt: true, rrule: true },
        }),
      loadOtherShifts: async () =>
        prisma.transportShift.findMany({
          where: {
            volunteerId: block.volunteerId!,
            status: { notIn: ['cancelled'] },
            ...(block.id ? { NOT: { id: block.id } } : {}),
          },
          select: { id: true, startsAt: true, endsAt: true, rrule: true, role: true },
        }),
    });
    if (warnings.length > 0 && !block.override) {
      return { ok: false, warnings };
    }
  }

  if (block.id) {
    await prisma.transportShift.update({
      where: { id: block.id },
      data: {
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        rrule: block.rrule,
        notes: block.notes,
        volunteerId: block.volunteerId,
        role: block.role,
        status: block.status ?? 'scheduled',
      },
    });
  } else {
    await prisma.transportShift.create({
      data: {
        volunteerId: block.volunteerId,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        rrule: block.rrule,
        notes: block.notes,
        role: block.role,
        status: block.status ?? 'scheduled',
      },
    });
  }
  revalidatePath('/transport/shifts');
  revalidatePath('/transport');
  return { ok: true };
}

export async function deleteTransportShift(id: string): Promise<SaveResult> {
  await requireOperator();
  if (!id) return { ok: false, error: 'Missing id.' };
  await prisma.transportShift.delete({ where: { id } });
  revalidatePath('/transport/shifts');
  revalidatePath('/transport');
  return { ok: true };
}
