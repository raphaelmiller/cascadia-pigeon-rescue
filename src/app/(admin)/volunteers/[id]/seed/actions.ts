'use server';

// Bulk-seed historical points for a single volunteer.
//
// Form posts a series of "kind, points, notes" tuples. Each becomes one
// VolunteerEvent with approvalStatus='approved' (no further review --
// this IS the review) and category='historical'.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOperator } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const HISTORICAL_KINDS = [
  'historical.years_of_service',
  'historical.major_contribution',
  'historical.fundraising',
  'historical.public_outreach',
  'historical.foster_career',
  'historical.adjustment',
] as const;

export async function seedHistoricalPoints(formData: FormData): Promise<void> {
  await requireOperator();
  const profileId = String(formData.get('profileId') ?? '').trim();
  if (!profileId) redirect('/volunteers');

  // Verify profile exists.
  const profile = await prisma.volunteerProfile.findUnique({ where: { id: profileId } });
  if (!profile) redirect('/volunteers');

  const summary = String(formData.get('summary') ?? '').trim() || null;

  // Parse grants: each historical kind has a points field + optional note.
  type Grant = { kind: string; points: number; note: string | null };
  const grants: Grant[] = [];
  for (const k of HISTORICAL_KINDS) {
    const p = String(formData.get(`pts_${k}`) ?? '').trim();
    const n = String(formData.get(`note_${k}`) ?? '').trim() || null;
    if (!p) continue;
    const points = Number(p);
    if (!Number.isFinite(points) || points === 0) continue;
    grants.push({ kind: k, points: Math.trunc(points), note: n });
  }
  if (grants.length === 0) {
    redirect(`/volunteers/${profileId}/seed?msg=no_grants`);
  }

  // Insert. Use approvalStatus='approved' since the coordinator IS
  // approving by submitting. Notes get the summary attached to the
  // first grant for audit lineage.
  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    const combined = i === 0 && summary
      ? `${g.note ? g.note + ' | ' : ''}Volunteer summary: ${summary.slice(0, 500)}`
      : g.note;
    await prisma.volunteerEvent.create({
      data: {
        profileId,
        category: 'historical',
        kind: g.kind,
        pointDelta: g.points,
        approvalStatus: 'approved',
        approvedById: 'admin',
        approvedAt: new Date(),
        notes: combined,
      },
    });
  }

  revalidatePath(`/volunteers/${profileId}`);
  redirect(`/volunteers/${profileId}?msg=historical_seeded`);
}
