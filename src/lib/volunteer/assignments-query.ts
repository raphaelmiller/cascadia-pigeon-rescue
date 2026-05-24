// Query helpers for the volunteer's "assignments awaiting action" feed.
//
// One server-side function: getOpenAssignmentsFor(profileId). Returns the
// list of jobs the volunteer should see on their dashboard right now,
// fully hydrated for rendering (title, deadline, point-person status,
// tier indicator).

import { prisma } from '@/lib/prisma';

export type OpenAssignment = {
  assignmentId: string;
  status: 'notified' | 'declined' | 'claimed' | 'resolved';
  jobType: 'RescueCase' | 'TransportRequest';
  jobId: string;
  title: string;
  description: string | null;
  location: string | null;
  emergencyFlag: boolean;
  deadline: Date | null;
  // Point person state on the underlying job
  pointPersonId: string | null;
  pointPersonName: string | null;
  pointPersonIsMe: boolean;
  // Whether the job has been resolved or marked figured-out
  figuredOutAt: Date | null;
  resolvedStatus: string | null; // 'rescued' | 'delivered' | etc.
  notifiedAt: Date;
  // Highest open tier on this job (1, 2, or 3). Null if no open escalation.
  currentTier: number | null;
};

export async function getOpenAssignmentsFor(profileId: string): Promise<OpenAssignment[]> {
  // Pull all assignments for this volunteer that haven't been declined
  // or resolved. We DO include "claimed" so the Point Person sees their
  // own claimed jobs.
  const rows = await prisma.assignment.findMany({
    where: {
      profileId,
      status: { in: ['notified', 'claimed'] },
    },
    orderBy: { notifiedAt: 'desc' },
  });
  if (rows.length === 0) return [];

  // Bulk-load the referenced jobs.
  const rescueIds = rows.filter(r => r.jobType === 'RescueCase').map(r => r.jobId);
  const transportIds = rows.filter(r => r.jobType === 'TransportRequest').map(r => r.jobId);

  const [rescues, transports] = await Promise.all([
    rescueIds.length === 0 ? [] : prisma.rescueCase.findMany({
      where: { id: { in: rescueIds } },
      select: {
        id: true, status: true, birdDescription: true, issue: true, location: true,
        emergencyFlag: true, deadline: true, figuredOutAt: true,
        pointPersonId: true,
        pointPerson: { select: { id: true, name: true } },
      },
    }),
    transportIds.length === 0 ? [] : prisma.transportRequest.findMany({
      where: { id: { in: transportIds } },
      select: {
        id: true, status: true, title: true, type: true, fromAddress: true,
        toAddress: true, description: true, pickupBy: true, deliverBy: true,
        emergencyFlag: true, deadline: true, figuredOutAt: true,
        pointPersonId: true,
        pointPerson: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Open escalations across all the jobs (one query).
  const openEsc = await prisma.escalation.findMany({
    where: {
      closedAt: null,
      OR: [
        { jobType: 'RescueCase', jobId: { in: rescueIds } },
        { jobType: 'TransportRequest', jobId: { in: transportIds } },
      ],
    },
    select: { jobType: true, jobId: true, tier: true },
  });
  const tierByJob = new Map<string, number>();
  for (const e of openEsc) {
    const key = `${e.jobType}:${e.jobId}`;
    const prev = tierByJob.get(key);
    if (prev === undefined || e.tier > prev) tierByJob.set(key, e.tier);
  }

  const rescueById = new Map(rescues.map(r => [r.id, r]));
  const transportById = new Map(transports.map(r => [r.id, r]));
  const RESCUE_RESOLVED = new Set(['rescued', 'escaped_flew_away', 'closed_unable']);
  const TRANSPORT_RESOLVED = new Set(['delivered', 'cancelled']);

  const out: OpenAssignment[] = [];
  for (const a of rows) {
    if (a.jobType === 'RescueCase') {
      const job = rescueById.get(a.jobId);
      if (!job) continue;
      const resolved = RESCUE_RESOLVED.has(job.status) || !!job.figuredOutAt;
      if (resolved && a.status !== 'claimed') continue; // hide resolved unclaimed
      out.push({
        assignmentId: a.id,
        status: a.status as OpenAssignment['status'],
        jobType: 'RescueCase',
        jobId: job.id,
        title: job.birdDescription
          ? `${job.birdDescription}`
          : 'Rescue case',
        description: job.issue,
        location: job.location,
        emergencyFlag: job.emergencyFlag,
        deadline: job.deadline,
        pointPersonId: job.pointPersonId,
        pointPersonName: job.pointPerson?.name ?? null,
        pointPersonIsMe: job.pointPersonId === profileId,
        figuredOutAt: job.figuredOutAt,
        resolvedStatus: resolved ? job.status : null,
        notifiedAt: a.notifiedAt,
        currentTier: tierByJob.get(`RescueCase:${job.id}`) ?? null,
      });
    } else {
      const job = transportById.get(a.jobId);
      if (!job) continue;
      const resolved = TRANSPORT_RESOLVED.has(job.status) || !!job.figuredOutAt;
      if (resolved && a.status !== 'claimed') continue;
      const deadline = job.deadline ?? job.deliverBy ?? job.pickupBy ?? null;
      out.push({
        assignmentId: a.id,
        status: a.status as OpenAssignment['status'],
        jobType: 'TransportRequest',
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
        resolvedStatus: resolved ? job.status : null,
        notifiedAt: a.notifiedAt,
        currentTier: tierByJob.get(`TransportRequest:${job.id}`) ?? null,
      });
    }
  }

  // Emergency first, then by deadline (sooner first), then by notifiedAt desc.
  out.sort((a, b) => {
    if (a.emergencyFlag !== b.emergencyFlag) return a.emergencyFlag ? -1 : 1;
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return b.notifiedAt.getTime() - a.notifiedAt.getTime();
  });
  return out;
}
