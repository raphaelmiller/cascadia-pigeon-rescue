// Query helpers for the volunteer's "assignments awaiting action" feed.
//
// One server-side function: getOpenAssignmentsFor(profileId). Returns the
// list of jobs the volunteer should see on their dashboard right now,
// fully hydrated for rendering (title, deadline, point-person status,
// tier indicator).

import { prisma } from '@/lib/prisma';
import {
  TAKEOVER_THRESHOLD_EMERGENCY_MS,
  TAKEOVER_THRESHOLD_ROUTINE_MS,
} from './job-resolution';

function mostRecent(dates: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

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
  pointPersonClaimedAt: Date | null;
  // Whether the job has been resolved or marked figured-out
  figuredOutAt: Date | null;
  resolvedStatus: string | null; // 'rescued' | 'delivered' | etc.
  notifiedAt: Date;
  // Highest open tier on this job (1, 2, or 3). Null if no open escalation.
  currentTier: number | null;
  // PR I (2026-05-24): non-PP engagement state.
  iAmOnStandby: boolean;
  followerCount: number;
  lastActivityAt: Date | null;
  // Milliseconds since the last activity. Null if no activity timestamp yet.
  idleMs: number | null;
  // True once idle > threshold for this job's urgency tier. Unlocks the
  // "Take over" CTA on non-PP cards.
  takeoverUnlocked: boolean;
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
        pointPersonClaimedAt: true,
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
        pointPersonClaimedAt: true,
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

  // PR I: follower counts across all the jobs (one query).
  const followers = await prisma.assignment.groupBy({
    by: ['jobType', 'jobId'],
    where: {
      standbyAt: { not: null },
      status: { in: ['notified', 'claimed'] },
      OR: [
        { jobType: 'RescueCase', jobId: { in: rescueIds } },
        { jobType: 'TransportRequest', jobId: { in: transportIds } },
      ],
    },
    _count: { _all: true },
  });
  const followerCountByJob = new Map<string, number>();
  for (const f of followers) followerCountByJob.set(`${f.jobType}:${f.jobId}`, f._count._all);

  // PR I: last-activity per rescue case via the timeline. Most recent
  // RescueCaseUpdate per case.
  const recentRescueUpdates = rescueIds.length === 0 ? [] : await prisma.rescueCaseUpdate.groupBy({
    by: ['caseId'],
    where: { caseId: { in: rescueIds } },
    _max: { createdAt: true },
  });
  const lastRescueUpdateBy = new Map<string, Date>();
  for (const r of recentRescueUpdates) {
    if (r._max.createdAt) lastRescueUpdateBy.set(r.caseId, r._max.createdAt);
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
      const lastAct = mostRecent([
        job.pointPersonClaimedAt,
        job.figuredOutAt,
        lastRescueUpdateBy.get(job.id) ?? null,
      ]);
      const idleMs = lastAct ? Date.now() - lastAct.getTime() : null;
      const threshold = job.emergencyFlag ? TAKEOVER_THRESHOLD_EMERGENCY_MS : TAKEOVER_THRESHOLD_ROUTINE_MS;
      const takeoverUnlocked =
        !!job.pointPersonId &&
        job.pointPersonId !== profileId &&
        idleMs !== null &&
        idleMs >= threshold;
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
        pointPersonClaimedAt: job.pointPersonClaimedAt,
        figuredOutAt: job.figuredOutAt,
        resolvedStatus: resolved ? job.status : null,
        notifiedAt: a.notifiedAt,
        currentTier: tierByJob.get(`RescueCase:${job.id}`) ?? null,
        iAmOnStandby: !!a.standbyAt,
        followerCount: followerCountByJob.get(`RescueCase:${job.id}`) ?? 0,
        lastActivityAt: lastAct,
        idleMs,
        takeoverUnlocked,
      });
    } else {
      const job = transportById.get(a.jobId);
      if (!job) continue;
      const resolved = TRANSPORT_RESOLVED.has(job.status) || !!job.figuredOutAt;
      if (resolved && a.status !== 'claimed') continue;
      const deadline = job.deadline ?? job.deliverBy ?? job.pickupBy ?? null;
      const lastAct = mostRecent([job.pointPersonClaimedAt, job.figuredOutAt]);
      const idleMs = lastAct ? Date.now() - lastAct.getTime() : null;
      const threshold = job.emergencyFlag ? TAKEOVER_THRESHOLD_EMERGENCY_MS : TAKEOVER_THRESHOLD_ROUTINE_MS;
      const takeoverUnlocked =
        !!job.pointPersonId &&
        job.pointPersonId !== profileId &&
        idleMs !== null &&
        idleMs >= threshold;
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
        pointPersonClaimedAt: job.pointPersonClaimedAt,
        figuredOutAt: job.figuredOutAt,
        resolvedStatus: resolved ? job.status : null,
        notifiedAt: a.notifiedAt,
        currentTier: tierByJob.get(`TransportRequest:${job.id}`) ?? null,
        iAmOnStandby: !!a.standbyAt,
        followerCount: followerCountByJob.get(`TransportRequest:${job.id}`) ?? 0,
        lastActivityAt: lastAct,
        idleMs,
        takeoverUnlocked,
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
