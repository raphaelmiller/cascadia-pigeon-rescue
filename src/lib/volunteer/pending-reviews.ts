// Pending-coordinator-review queue.
//
// All VolunteerEvent rows with approvalStatus = 'pending' end up here.
// In Phase 1.5 the only event kind that flows through this is
// 'profile.email_change_requested'. In Phase 2, point-rule events above
// the auto-approve threshold will also land here.
//
// Each item knows enough to render a one-line summary + appropriate
// approve/reject actions. The "approve" semantic depends on the event
// kind -- for email changes, approval means actually swap the email on
// VolunteerProfile.

import { prisma } from '@/lib/prisma';

export type PendingReview = {
  eventId: string;
  profileId: string;
  profileName: string;
  kind: string;
  pointDelta: number;
  notes: string | null;
  createdAt: Date;
  // What does "approve" mean for this kind?
  actionLabel: string;
};

const ACTION_LABEL: Record<string, string> = {
  'profile.email_change_requested': 'Change sign-in email',
  // Phase 2: point-rule events
};

export async function getPendingReviews(): Promise<PendingReview[]> {
  const rows = await prisma.volunteerEvent.findMany({
    where: { approvalStatus: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { profile: { select: { name: true } } },
  });
  return rows.map(r => ({
    eventId: r.id,
    profileId: r.profileId,
    profileName: r.profile.name,
    kind: r.kind,
    pointDelta: r.pointDelta,
    notes: r.notes,
    createdAt: r.createdAt,
    actionLabel: ACTION_LABEL[r.kind] ?? 'Approve',
  }));
}
