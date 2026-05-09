import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.foster.update({ where: { id }, data: { archivedAt: null, deletedAt: null } });
  revalidatePath('/fosters');
  revalidatePath('/');
  revalidatePath('/archive');
  return NextResponse.json({ ok: true });
}
