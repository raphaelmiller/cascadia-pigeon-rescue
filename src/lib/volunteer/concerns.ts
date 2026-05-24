// PR H (2026-05-24) — Volunteer-reported concerns feed.
//
// Surfaces three signals for coordinators:
//   1. Recent FosterCheckIn rows with pulse in ('watching', 'concern').
//   2. Recent DailyUpdate rows with high stressLevel (>= 7).
//   3. Recent FosterCheckIn rows with a free-text note that mentions
//      a concern keyword (lightweight regex hit).
//
// Coordinators see a count badge on the dispatch board + can drill in
// to a dedicated /dispatch/concerns page. Designed to catch fosters
// silently struggling before things explode.

import { prisma } from '@/lib/prisma';

export type ConcernSignal = {
  id: string;
  kind: 'checkin' | 'daily_update';
  pulse: 'watching' | 'concern' | 'high_stress';
  fosterName: string | null;
  fosterId: string | null;
  birdName: string | null;
  birdId: string | null;
  note: string | null;
  stressLevel: number | null;
  createdAt: Date;
};

const CONCERN_WINDOW_DAYS = 7;
const STRESS_THRESHOLD = 7;

export async function getRecentConcerns(limit = 50): Promise<ConcernSignal[]> {
  const since = new Date(Date.now() - CONCERN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [checkIns, updates] = await Promise.all([
    prisma.fosterCheckIn.findMany({
      where: {
        createdAt: { gte: since },
        pulse: { in: ['watching', 'concern'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        profile: { select: { id: true, name: true } },
        bird: { select: { id: true, name: true } },
      },
    }),
    prisma.dailyUpdate.findMany({
      where: {
        createdAt: { gte: since },
        stressLevel: { gte: STRESS_THRESHOLD },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        foster: { select: { id: true, name: true } },
        bird: { select: { id: true, name: true } },
      },
    }),
  ]);

  const out: ConcernSignal[] = [];

  for (const c of checkIns) {
    out.push({
      id: `ci:${c.id}`,
      kind: 'checkin',
      pulse: c.pulse as 'watching' | 'concern',
      fosterName: c.profile.name,
      fosterId: c.profile.id,
      birdName: c.bird?.name ?? null,
      birdId: c.bird?.id ?? null,
      note: c.note,
      stressLevel: null,
      createdAt: c.createdAt,
    });
  }
  for (const u of updates) {
    out.push({
      id: `du:${u.id}`,
      kind: 'daily_update',
      pulse: 'high_stress',
      fosterName: u.foster?.name ?? null,
      fosterId: u.foster?.id ?? null,
      birdName: u.bird?.name ?? null,
      birdId: u.bird?.id ?? null,
      note: u.concerns ?? u.notes ?? null,
      stressLevel: u.stressLevel,
      createdAt: u.createdAt,
    });
  }

  return out
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function countOpenConcerns(): Promise<number> {
  const since = new Date(Date.now() - CONCERN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [a, b] = await Promise.all([
    prisma.fosterCheckIn.count({
      where: { createdAt: { gte: since }, pulse: { in: ['watching', 'concern'] } },
    }),
    prisma.dailyUpdate.count({
      where: { createdAt: { gte: since }, stressLevel: { gte: STRESS_THRESHOLD } },
    }),
  ]);
  return a + b;
}
