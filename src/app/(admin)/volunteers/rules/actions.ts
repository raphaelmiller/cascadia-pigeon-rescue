'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? '').trim();
}

export async function updateRule(formData: FormData): Promise<void> {
  await requireOperator();
  const kind = s(formData, 'kind');
  if (!kind) redirect('/volunteers/rules');
  const pointsRaw = s(formData, 'points');
  const enabled = formData.get('enabled') === '1';
  const autoApproveRaw = s(formData, 'autoApproveMax');

  const points = pointsRaw === '' ? null : Number(pointsRaw);
  if (points !== null && !Number.isFinite(points)) {
    redirect('/volunteers/rules?msg=invalid_points');
  }
  const autoApproveMax = autoApproveRaw === '' ? null : Number(autoApproveRaw);
  if (autoApproveMax !== null && (!Number.isFinite(autoApproveMax) || autoApproveMax < 0)) {
    redirect('/volunteers/rules?msg=invalid_auto');
  }

  await prisma.pointRule.update({
    where: { kind },
    data: {
      ...(points !== null ? { points: Math.trunc(points) } : {}),
      enabled,
      autoApproveMax: autoApproveMax === null ? null : Math.trunc(autoApproveMax),
    },
  });
  revalidatePath('/volunteers/rules');
  redirect('/volunteers/rules?msg=saved');
}

export async function bulkToggleCategory(formData: FormData): Promise<void> {
  await requireOperator();
  const category = s(formData, 'category');
  const enabled = formData.get('enabled') === '1';
  if (!category) redirect('/volunteers/rules');
  await prisma.pointRule.updateMany({
    where: { category },
    data: { enabled },
  });
  revalidatePath('/volunteers/rules');
  redirect(`/volunteers/rules?msg=bulk_${enabled ? 'enabled' : 'disabled'}`);
}
