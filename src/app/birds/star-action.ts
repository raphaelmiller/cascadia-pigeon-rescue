'use server';

// PR F: Server action for toggling a bird's `starred` boolean.
// Used by the bird list card star + the bird detail page star.
//
// The star is shared across operators (we have one admin login) and is
// purely an operator-facing visual marker — no business logic depends on
// it. Therefore we keep the action minimal: auth check, single update,
// revalidate the obvious paths.

import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function toggleBirdStar(id: string, next: boolean): Promise<{ ok: boolean }> {
  await requireOperator();
  if (!id) return { ok: false };
  try {
    await prisma.bird.update({ where: { id }, data: { starred: next } });
  } catch {
    return { ok: false };
  }
  revalidatePath('/birds');
  revalidatePath(`/birds/${id}`);
  return { ok: true };
}
