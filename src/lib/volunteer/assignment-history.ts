// Per-job-type assignment history for the volunteer-facing
// /v/transport and /v/rescue list pages.
//
// Unlike the dashboard's "Awaiting your action" feed (which only shows
// open / claimed assignments), this returns the full history split into
// three buckets:
//
//   active   - status notified OR claimed AND job not resolved
//   recent   - resolved within the last 30 days
//   archive  - anything older (we return a count, not the rows)
//
// We deliberately do NOT do pagination -- a volunteer's history is at
// most a few dozen rows even after a year. If that changes, swap the
// "archive" bucket for a real paginator.

import { prisma } from '@/lib/prisma';
import type { JobType } from './dispatch';

export type HistoryItem = {
  assignmentId: string;
  status: 'notified' | 'declined' | 'claimed' | 'resolved';
  jobType: JobType;
  jobId: string;
  title: string;
  description: string | null;
  location: string | null;
  emergencyFlag: boolean;
  deadline: Date | null;
  pointPersonId: string | null;
  pointPersonName: string | null;
  pointPersonIsMe: boolean;
  figuredOutAt: Date | null;
  // Underlying job status -- e.g. "rescued" / "delivered" / "open"
  jobStatus: string;
  resolved: boolean;
  notifiedAt: Date;
  claimedAt: Date | null;
  declinedAt: Date | null;
  currentTier: number | null;
};

export type HistoryBuckets = {
  active: HistoryItem[];
  recent: HistoryItem[];
  archiveCount: number;
};

const RESCUE_RESOLVED = new Set(['rescued', 'escaped_flew_away', 'closed_unable']);
const TRANSPORT_RESOLVED = new Set(['delivered', 'cancelled']);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function getAssignmentHistory(
  profileId: string,
  jobType: JobType,
): Promise<HistoryBuckets> {
  // Pull every assignment this volunteer has had for this job type.
  const all = await prisma.assignment.findMany({
    where: { profileId, jobType },
    orderBy: { notifiedAt: 'desc' },
  });
  if (all.length === 0) return { active: [], recent: [], archiveCount: 0 };

  const ids = all.map(a => a.jobId);

  // Bulk-load the underlying jobs in one query.
  const [rescues, transports, openEsc] = await Promise.all([
    jobType === 'RescueCase' ? prisma.rescueCase.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, status: true, birdDescription: true, issue: true, location: true,
        emergencyFlag: true, deadline: true, figuredOutAt: true,
        pointPersonId: true,
        pointPerson: { select: { id: true, name: true } },
      },
    }) : [],
    jobType === 'TransportRequest' ? prisma.transportRequest.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, status: true, title: true, type: true, fromAddress: true,
        toAddress: true, description: true, pickupBy: true, deliverBy: true,
        emergencyFlag: true, deadline: true, figuredOutAt: true,
        pointPersonId: true,
        pointPerson: { select: { id: true, name: true } },
      },
    }) : [],
    prisma.escalation.findMany({
      where: { closedAt: null, jobType, jobId: { in: ids } },
      select: { jobId: true, tier: true },
    }),
  ]);

  const tierByJob = new Map<string, number>();
  for (const e of openEsc) {
    const prev = tierByJob.get(e.jobId);
    if (prev === undefined || e.tier > prev) tierByJob.set(e.jobId, e.tier);
  }

  const rescueById = new Map(rescues.map(r => [r.id, r]));
  const transportById = new Map(transports.map(t => [t.id, t]));

  const items: HistoryItem[] = [];
  for (const a of all) {
    if (jobType === 'RescueCase') {
      const job = rescueById.get(a.jobId);
      if (!job) continue;
      const resolved = RESCUE_RESOLVED.has(job.status) || !!job.figuredOutAt;
      items.push({
        assignmentId: a.id,
        status: a.status as HistoryItem['status'],
        jobType,
        jobId: job.id,
        title: job.birdDescription ?? 'Rescue case',
        description: job.issue,
        location: job.location,
        emergencyFlag: job.emergencyFlag,
        deadline: job.deadline,
        pointPersonId: job.pointPersonId,
        pointPersonName: job.pointPerson?.name ?? null,
        pointPersonIsMe: job.pointPersonId === profileId,
        figuredOutAt: job.figuredOutAt,
        jobStatus: job.status,
        resolved,
        notifiedAt: a.notifiedAt,
        claimedAt: a.claimedAt,
        declinedAt: a.declinedAt,
        currentTier: tierByJob.get(job.id) ?? null,
      });
    } else {
      const job = transportById.get(a.jobId);
      if (!job) continue;
      const resolved = TRANSPORT_RESOLVED.has(job.status) || !!job.figuredOutAt;
      const deadline = job.deadline ?? job.deliverBy ?? job.pickupBy ?? null;
      items.push({
        assignmentId: a.id,
        status: a.status as HistoryItem['status'],
        jobType,
        jobId: job.id,
        title: job.title ?? job.type ?? 'Transport request',
        description: job.description,
        location: job.fromAddress || job.toAddress,
        emergencyFlag: job.emergencyFlag,
        deadline,
        pointPersonId: job.pointPersonId,
        pointPersonName: job.pointPerson?.name ?? null,
        pointPersonIsMe: job.pointPersonId === profileId,
        figuredOutAt: job.figuredOutAt,
        jobStatus: job.status,
        resolved,
        notifiedAt: a.notifiedAt,
        claimedAt: a.claimedAt,
        declinedAt: a.declinedAt,
        currentTier: tierByJob.get(job.id) ?? null,
      });
    }
  }

  // Bucket the items.
  const now = Date.now();
  const active: HistoryItem[] = [];
  const recent: HistoryItem[] = [];
  let archiveCount = 0;
  for (const it of items) {
    const isResolvedForMe = it.resolved || it.status === 'declined';
    if (!isResolvedForMe) {
      active.push(it);
      continue;
    }
    // Pick the "when was this finished from my POV" timestamp.
    const finishedAt =
      it.declinedAt ?? it.figuredOutAt ?? it.claimedAt ?? it.notifiedAt;
    if (now - finishedAt.getTime() < THIRTY_DAYS_MS) {
      recent.push(it);
    } else {
      archiveCount++;
    }
  }

  // Sort buckets: active by urgency (emergency first then deadline);
  // recent by notifiedAt desc.
  active.sort((a, b) => {
    if (a.emergencyFlag !== b.emergencyFlag) return a.emergencyFlag ? -1 : 1;
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.notifiedAt.getTime() - a.notifiedAt.getTime();
  });
  recent.sort((a, b) => b.notifiedAt.getTime() - a.notifiedAt.getTime());

  return { active, recent, archiveCount };
}
