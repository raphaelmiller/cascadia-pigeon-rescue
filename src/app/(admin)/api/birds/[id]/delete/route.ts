import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireOperator } from '@/lib/auth';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await ctx.params;
  await prisma.bird.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/birds');
  revalidatePath('/');
  revalidatePath('/archive');
  return NextResponse.json({ ok: true });
}
