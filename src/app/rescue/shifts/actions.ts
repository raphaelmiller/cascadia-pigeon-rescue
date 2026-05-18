'use server';

import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { parseBlockForm, runShiftConflictCheck } from '@/lib/scheduling-actions';

export type SaveResult = { ok: boolean; warnings?: string[]; error?: string };

export async function saveRescueShift(fd: FormData): Promise<SaveResult> {
  await requireOperator();
  let block;
  try {
    block = parseBlockForm(fd);
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }

  let warnings: string[] = [];
  if (block.volunteerId) {
    const rescuer = await prisma.rescueVolunteer.findUnique({
      where: { id: block.volunteerId }, select: { name: true },
    });
    if (!rescuer) return { ok: false, error: 'Rescuer not found.' };
    warnings = await runShiftConflictCheck({
      block,
      assigneeName: rescuer.name,
      loadAvailabilities: async () =>
        prisma.rescueAvailability.findMany({
          where: { volunteerId: block.volunteerId! },
          select: { id: true, startsAt: true, endsAt: true, rrule: true },
        }),
      loadOtherShifts: async () =>
        prisma.rescueShift.findMany({
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
    await prisma.rescueShift.update({
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
    await prisma.rescueShift.create({
      data: {
        volunteerId: block.volunteerId,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        rrule: block.rrule,
        notes: block.notes,
        role: block.role,
        status: block.status ?? 'scheduled',
        // Pre-existing column on RescueShift — default keeps the /rescue
        // page's filter happy. Modal doesn't expose this yet (it's the
        // older categorical axis, not the new state-machine status).
        shiftType: 'on_call',
      },
    });
  }
  revalidatePath('/rescue/shifts');
  revalidatePath('/rescue');
  return { ok: true };
}

export async function deleteRescueShift(id: string): Promise<SaveResult> {
  await requireOperator();
  if (!id) return { ok: false, error: 'Missing id.' };
  await prisma.rescueShift.delete({ where: { id } });
  revalidatePath('/rescue/shifts');
  revalidatePath('/rescue');
  return { ok: true };
}
