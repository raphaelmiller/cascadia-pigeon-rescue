// Per-volunteer service-record query.
//
// Returns the data shape used by /v/service-record. No leaderboard, no
// comparison -- just "your contribution over time". Christina's spec
// is explicit: this is a record, not a ranking.

import { prisma } from '@/lib/prisma';

export type ServiceRecord = {
  totalPoints: number;
  totalEvents: number;
  joinedAt: Date;
  byCategory: { category: string; points: number; events: number }[];
  recentEvents: {
    id: string;
    kind: string;
    category: string;
    pointDelta: number;
    approvalStatus: string;
    refType: string | null;
    refId: string | null;
    notes: string | null;
    createdAt: Date;
  }[];
  pendingPoints: number; // points awaiting coordinator approval
  reliability: ReliabilityScore;
  activity: ActivityScore;
};

export type ReliabilityScore = {
  // 0-100. Higher = more reliable.
  score: number;
  band: 'excellent' | 'good' | 'mixed' | 'low' | 'new';
  // Inputs (for the "how is this computed?" tooltip):
  claimsAccepted: number;
  declines: number;
  noResponseTimeouts: number; // assignments that hit T2 without a decision from this volunteer
  resolvedAsPointPerson: number;
};

export type ActivityScore = {
  // 0-100. Higher = more active.
  score: number;
  band: 'extremely' | 'very' | 'moderately' | 'lightly' | 'dormant';
  daysSinceLastEvent: number;
  events30d: number;
  events90d: number;
};

const CATEGORY_ORDER = ['rescue', 'transport', 'foster', 'check_in', 'coordination', 'historical', 'admin', 'system'];

export async function getServiceRecord(profileId: string): Promise<ServiceRecord> {
  const [profile, allEvents, assignments] = await Promise.all([
    prisma.volunteerProfile.findUnique({
      where: { id: profileId },
      select: { createdAt: true },
    }),
    prisma.volunteerEvent.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.assignment.findMany({
      where: { profileId },
      select: { status: true, jobType: true, jobId: true, notifiedAt: true, claimedAt: true },
    }),
  ]);

  const joinedAt = profile?.createdAt ?? new Date();
  const banked = allEvents.filter(e => ['auto', 'approved', 'adjusted'].includes(e.approvalStatus));
  const pending = allEvents.filter(e => e.approvalStatus === 'pending');

  const totalPoints = banked.reduce((s, e) => s + e.pointDelta, 0);
  const pendingPoints = pending.reduce((s, e) => s + e.pointDelta, 0);

  // By-category breakdown.
  const catMap = new Map<string, { points: number; events: number }>();
  for (const e of banked) {
    const c = catMap.get(e.category) ?? { points: 0, events: 0 };
    c.points += e.pointDelta;
    c.events += 1;
    catMap.set(e.category, c);
  }
  const byCategory = CATEGORY_ORDER
    .filter(cat => catMap.has(cat))
    .map(cat => ({ category: cat, ...catMap.get(cat)! }));

  // Recent events (last 25 -- enough for the "history" tab).
  const recentEvents = allEvents.slice(0, 25).map(e => ({
    id: e.id,
    kind: e.kind,
    category: e.category,
    pointDelta: e.pointDelta,
    approvalStatus: e.approvalStatus,
    refType: e.refType,
    refId: e.refId,
    notes: e.notes,
    createdAt: e.createdAt,
  }));

  // Reliability score.
  const claimsAccepted = assignments.filter(a => a.status === 'claimed').length;
  const declines       = assignments.filter(a => a.status === 'declined').length;
  const resolvedAsPointPerson = banked.filter(e =>
    ['rescue.resolved_rescued', 'rescue.resolved_escaped',
     'transport.delivered'].includes(e.kind)).length;

  // "noResponseTimeouts": assignments that were never decided by the
  // volunteer AND the job moved past T1 (signals a missed window). We
  // approximate via assignments with status='notified' older than 1h
  // where any escalation on the same job is at tier >= 2.
  const oldNotified = assignments.filter(a =>
    a.status === 'notified' &&
    Date.now() - a.notifiedAt.getTime() > 60 * 60 * 1000
  );
  // Cheap-and-good-enough approximation: count those whose jobs have
  // any escalation past T1. We'd need a join to do this accurately;
  // for Phase 2 ship, use the count of stale assignments as a proxy.
  const noResponseTimeouts = oldNotified.length;

  const totalAttempts = claimsAccepted + declines + noResponseTimeouts;
  let reliabilityScore: number;
  let reliabilityBand: ReliabilityScore['band'];
  if (totalAttempts < 3) {
    reliabilityScore = 50;
    reliabilityBand = 'new';
  } else {
    // Claims = +100 each, declines = +60 each (still a response), timeouts = 0
    const weighted = claimsAccepted * 100 + declines * 60;
    reliabilityScore = Math.max(0, Math.min(100, Math.round(weighted / totalAttempts)));
    if (reliabilityScore >= 85) reliabilityBand = 'excellent';
    else if (reliabilityScore >= 70) reliabilityBand = 'good';
    else if (reliabilityScore >= 50) reliabilityBand = 'mixed';
    else reliabilityBand = 'low';
  }

  // Activity score.
  const now = Date.now();
  const events30d = banked.filter(e => now - e.createdAt.getTime() < 30 * 86400_000).length;
  const events90d = banked.filter(e => now - e.createdAt.getTime() < 90 * 86400_000).length;
  const lastEvent = banked[0];
  const daysSinceLastEvent = lastEvent
    ? Math.floor((now - lastEvent.createdAt.getTime()) / 86400_000)
    : Infinity;

  // Score: weighted 30d (heavier) + 90d (lighter), capped.
  // 10 events in 30d -> ~80; 20+ in 30d -> 100.
  let activityScore = Math.min(100, events30d * 6 + Math.max(0, events90d - events30d) * 1.5);
  if (daysSinceLastEvent > 30) activityScore = Math.min(activityScore, 40);
  if (daysSinceLastEvent > 90) activityScore = Math.min(activityScore, 10);
  activityScore = Math.round(activityScore);

  let activityBand: ActivityScore['band'];
  if (activityScore >= 85) activityBand = 'extremely';
  else if (activityScore >= 60) activityBand = 'very';
  else if (activityScore >= 35) activityBand = 'moderately';
  else if (activityScore >= 10) activityBand = 'lightly';
  else activityBand = 'dormant';

  return {
    totalPoints,
    totalEvents: banked.length,
    joinedAt,
    byCategory,
    recentEvents,
    pendingPoints,
    reliability: {
      score: reliabilityScore,
      band: reliabilityBand,
      claimsAccepted,
      declines,
      noResponseTimeouts,
      resolvedAsPointPerson,
    },
    activity: {
      score: activityScore,
      band: activityBand,
      daysSinceLastEvent: daysSinceLastEvent === Infinity ? 9999 : daysSinceLastEvent,
      events30d,
      events90d,
    },
  };
}
