// Coordinator dispatch-board data loader.
//
// Returns "every open job in the system" with full triage context:
// open escalation tier, claim state, candidate count, time since
// notification. The coordinator scans this once and acts on anything
// flagged red.

import { prisma } from '@/lib/prisma';

export type BoardJob = {
  jobType: 'RescueCase' | 'TransportRequest';
  jobId: string;
  title: string;
  description: string | null;
  location: string | null;
  emergencyFlag: boolean;
  deadline: Date | null;
  pointPersonId: string | null;
  pointPersonName: string | null;
  figuredOutAt: Date | null;
  createdAt: Date;
  // Highest open tier, null if no open escalation.
  currentTier: number | null;
  // Open escalation expiresAt (highest tier).
  tierExpiresAt: Date | null;
  // Count of "notified" assignments (volunteers haven't yet claimed/declined).
  notifiedCount: number;
  // Count of "declined".
  declinedCount: number;
  // Candidates the coordinator can manually claim on behalf of.
  candidates: { id: string; name: string; status: string }[];
};

export async function getDispatchBoard(): Promise<BoardJob[]> {
  // Pull every open rescue + transport job.
  const RESCUE_OPEN_STATUSES = ['needs_rescue']; // active states
  const TRANSPORT_OPEN_STATUSES = ['open', 'assigned', 'in_transit'];

  const [rescues, transports] = await Promise.all([
    prisma.rescueCase.findMany({
      where: {
        status: { in: RESCUE_OPEN_STATUSES },
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true, status: true, birdDescription: true, issue: true, location: true,
        emergencyFlag: true, deadline: true, figuredOutAt: true, createdAt: true,
        pointPerson: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transportRequest.findMany({
      where: {
        status: { in: TRANSPORT_OPEN_STATUSES },
      },
      select: {
        id: true, status: true, title: true, type: true, fromAddress: true,
        description: true, deadline: true, deliverBy: true, pickupBy: true,
        emergencyFlag: true, figuredOutAt: true, createdAt: true,
        pointPerson: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const jobs: BoardJob[] = [];
  for (const r of rescues) {
    jobs.push({
      jobType: 'RescueCase', jobId: r.id,
      title: r.birdDescription ?? 'Rescue case',
      description: r.issue,
      location: r.location,
      emergencyFlag: r.emergencyFlag,
      deadline: r.deadline,
      pointPersonId: r.pointPerson?.id ?? null,
      pointPersonName: r.pointPerson?.name ?? null,
      figuredOutAt: r.figuredOutAt,
      createdAt: r.createdAt,
      currentTier: null, tierExpiresAt: null, notifiedCount: 0, declinedCount: 0,
      candidates: [],
    });
  }
  for (const t of transports) {
    jobs.push({
      jobType: 'TransportRequest', jobId: t.id,
      title: t.title ?? t.type ?? 'Transport request',
      description: t.description,
      location: t.fromAddress,
      emergencyFlag: t.emergencyFlag,
      deadline: t.deadline ?? t.deliverBy ?? t.pickupBy ?? null,
      pointPersonId: t.pointPerson?.id ?? null,
      pointPersonName: t.pointPerson?.name ?? null,
      figuredOutAt: t.figuredOutAt,
      createdAt: t.createdAt,
      currentTier: null, tierExpiresAt: null, notifiedCount: 0, declinedCount: 0,
      candidates: [],
    });
  }
  if (jobs.length === 0) return [];

  // Open escalations + assignment counts in two queries.
  const rescueIds = jobs.filter(j => j.jobType === 'RescueCase').map(j => j.jobId);
  const transportIds = jobs.filter(j => j.jobType === 'TransportRequest').map(j => j.jobId);

  const [openEsc, allAssignments] = await Promise.all([
    prisma.escalation.findMany({
      where: {
        closedAt: null,
        OR: [
          { jobType: 'RescueCase', jobId: { in: rescueIds } },
          { jobType: 'TransportRequest', jobId: { in: transportIds } },
        ],
      },
      select: { jobType: true, jobId: true, tier: true, expiresAt: true },
    }),
    prisma.assignment.findMany({
      where: {
        OR: [
          { jobType: 'RescueCase', jobId: { in: rescueIds } },
          { jobType: 'TransportRequest', jobId: { in: transportIds } },
        ],
      },
      select: { jobType: true, jobId: true, status: true, profileId: true,
               profile: { select: { name: true } } },
    }),
  ]);

  const tierMap = new Map<string, { tier: number; expiresAt: Date }>();
  for (const e of openEsc) {
    const key = `${e.jobType}:${e.jobId}`;
    const prev = tierMap.get(key);
    if (!prev || e.tier > prev.tier) tierMap.set(key, { tier: e.tier, expiresAt: e.expiresAt });
  }
  const countMap = new Map<string, { notified: number; declined: number }>();
  const candMap = new Map<string, { id: string; name: string; status: string }[]>();
  for (const a of allAssignments) {
    const key = `${a.jobType}:${a.jobId}`;
    const c = countMap.get(key) ?? { notified: 0, declined: 0 };
    if (a.status === 'notified') c.notified++;
    if (a.status === 'declined') c.declined++;
    countMap.set(key, c);
    const list = candMap.get(key) ?? [];
    list.push({ id: a.profileId, name: a.profile?.name ?? '(unknown)', status: a.status });
    candMap.set(key, list);
  }
  for (const j of jobs) {
    const key = `${j.jobType}:${j.jobId}`;
    const t = tierMap.get(key);
    if (t) { j.currentTier = t.tier; j.tierExpiresAt = t.expiresAt; }
    const c = countMap.get(key);
    if (c) { j.notifiedCount = c.notified; j.declinedCount = c.declined; }
    const cands = candMap.get(key);
    if (cands) j.candidates = cands;
  }

  // Sort: emergency first, then by tier (higher = more urgent), then deadline.
  jobs.sort((a, b) => {
    if (a.emergencyFlag !== b.emergencyFlag) return a.emergencyFlag ? -1 : 1;
    const at = a.currentTier ?? 0;
    const bt = b.currentTier ?? 0;
    if (at !== bt) return bt - at;
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return jobs;
}
