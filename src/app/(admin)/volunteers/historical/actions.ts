'use server';

// Christina feedback (2026-05-25): central historical contributions
// admin page. Creates one VolunteerEvent per submission with:
//   - category   = 'historical'
//   - kind       = one of historical.{rescues,transport_drives,coordination,foster}_count
//   - pointDelta = count × PointRule.points for that kind
//   - approvalStatus = 'approved' (the admin IS the review)
//   - notes      = "count=N | range=YYYY-MM-DD..YYYY-MM-DD | <free text>"
//     (the page parses this back out for the recent-grants log).

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOperator } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_KINDS = new Set([
  'historical.rescues_count',
  'historical.transport_drives_count',
  'historical.coordination_count',
  'historical.foster_count',
]);

export async function grantHistoricalContribution(formData: FormData): Promise<void> {
  await requireOperator();

  const profileId = String(formData.get('profileId') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim();
  const countRaw = String(formData.get('count') ?? '').trim();
  const rangeStart = String(formData.get('rangeStart') ?? '').trim();
  const rangeEnd = String(formData.get('rangeEnd') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!profileId || !ALLOWED_KINDS.has(kind) || !countRaw) {
    redirect('/volunteers/historical?msg=invalid');
  }
  const count = Math.trunc(Number(countRaw));
  if (!Number.isFinite(count) || count <= 0) {
    redirect('/volunteers/historical?msg=invalid');
  }

  // Verify profile exists.
  const profile = await prisma.volunteerProfile.findUnique({
    where: { id: profileId },
    select: { id: true },
  });
  if (!profile) {
    redirect('/volunteers/historical?msg=invalid');
  }

  // Look up the rule for per-unit points.
  const rule = await prisma.pointRule.findUnique({
    where: { kind },
    select: { points: true, enabled: true },
  });
  if (!rule) {
    redirect('/volunteers/historical?msg=rule_missing');
  }
  if (!rule.enabled) {
    redirect(`/volunteers/historical?msg=rule_disabled&volunteerId=${profileId}`);
  }

  const pointDelta = rule.points * count;

  // Compose notes blob — page parses this back for display.
  const parts: string[] = [`count=${count}`];
  if (rangeStart || rangeEnd) {
    parts.push(`range=${rangeStart || '?'}..${rangeEnd || '?'}`);
  }
  if (note) parts.push(note.slice(0, 400));
  const notesBlob = parts.join(' | ');

  await prisma.volunteerEvent.create({
    data: {
      profileId,
      category: 'historical',
      kind,
      pointDelta,
      approvalStatus: 'approved',
      approvedById: 'admin',
      approvedAt: new Date(),
      notes: notesBlob,
    },
  });

  revalidatePath('/volunteers/historical');
  revalidatePath(`/volunteers/${profileId}`);
  redirect('/volunteers/historical?msg=granted');
}
