import { prisma } from '@/lib/prisma';
import { computeRunout } from '@/lib/utils';
import { effectivePickupTime, requestTitle } from '@/lib/transportDisplay';

/**
 * birdSnapshot — pulls upcoming appointments (calendar events + transports +
 * vet visits) and refill-due medications for a single bird, and a batch
 * variant for the birds list page. Intentionally returns plain shapes the
 * UI can render without further joins.
 */

export type UpcomingItem = {
  kind: 'event' | 'transport' | 'vet';
  id: string;
  when: Date;
  title: string;
  detail?: string | null;
  href: string;
};

export type RefillItem = {
  id: string;
  name: string;
  runout: Date;
  daysUntil: number; // negative = overdue
};

export type BirdSnapshot = {
  upcoming: UpcomingItem[];
  refills: RefillItem[];
};

/**
 * Compute snapshot for a single bird. Keeps the lookahead window short by
 * default (30 days) so the UI is focused on what matters now.
 */
export async function getBirdSnapshot(birdId: string, lookaheadDays = 30): Promise<BirdSnapshot> {
  const now = new Date();
  const horizon = new Date(now.getTime() + lookaheadDays * 86400000);

  const [events, transports, vetVisits, meds] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { birdId, startsAt: { gte: now, lte: horizon }, done: false },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.transportRequest.findMany({
      where: {
        birdId,
        pickupBy: { gte: now, lte: horizon },
        status: { in: ['open', 'assigned', 'in_transit'] },
      },
      include: { volunteer: true },
      orderBy: { pickupBy: 'asc' },
    }),
    prisma.vetVisit.findMany({
      where: { birdId, visitDate: { gte: now, lte: horizon } },
      orderBy: { visitDate: 'asc' },
    }),
    prisma.medication.findMany({
      where: {
        birdId,
        OR: [{ stopDate: null }, { stopDate: { gt: now } }],
        refillDelivered: false,
      },
    }),
  ]);

  const upcoming: UpcomingItem[] = [];
  for (const e of events) {
    upcoming.push({
      kind: 'event',
      id: e.id,
      when: e.startsAt,
      title: e.title,
      detail: e.type.replace('_', ' '),
      href: `/calendar?day=${e.startsAt.toISOString().slice(0, 10)}`,
    });
  }
  for (const t of transports) {
    // PR C: TransportRequest fields are now nullable for multi-stop
    // rows. Use the helpers so legacy and new shapes both render.
    const when = effectivePickupTime(t);
    if (!when) continue;
    upcoming.push({
      kind: 'transport',
      id: t.id,
      when,
      title: requestTitle(t),
      detail: t.volunteer ? `Driver: ${t.volunteer.name}` : 'UNASSIGNED',
      href: `/transport/requests/${t.id}`,
    });
  }
  for (const v of vetVisits) {
    upcoming.push({
      kind: 'vet',
      id: v.id,
      when: v.visitDate,
      title: v.vetName ? `Vet · ${v.vetName}` : 'Vet visit',
      detail: v.diagnosis || null,
      href: `/birds/${birdId}#vet-visits`,
    });
  }
  upcoming.sort((a, b) => a.when.getTime() - b.when.getTime());

  const refills: RefillItem[] = [];
  for (const m of meds) {
    const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
    if (!runout) continue;
    const days = Math.floor((runout.getTime() - now.getTime()) / 86400000);
    // Surface refills that are runout within the next 14 days (or already overdue).
    if (days <= 14) {
      refills.push({ id: m.id, name: m.name, runout, daysUntil: days });
    }
  }
  refills.sort((a, b) => a.daysUntil - b.daysUntil);

  return { upcoming, refills };
}

/**
 * Batch variant for the birds list. Returns a Map<birdId, snapshot> with one
 * round-trip set of queries instead of N. Skips vet visits (lighter list view).
 */
export async function getBirdsSnapshots(birdIds: string[], lookaheadDays = 30): Promise<Map<string, BirdSnapshot>> {
  const out = new Map<string, BirdSnapshot>();
  if (birdIds.length === 0) return out;
  for (const id of birdIds) out.set(id, { upcoming: [], refills: [] });

  const now = new Date();
  const horizon = new Date(now.getTime() + lookaheadDays * 86400000);

  const [events, transports, meds] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { birdId: { in: birdIds }, startsAt: { gte: now, lte: horizon }, done: false },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.transportRequest.findMany({
      where: {
        birdId: { in: birdIds },
        pickupBy: { gte: now, lte: horizon },
        status: { in: ['open', 'assigned', 'in_transit'] },
      },
      include: { volunteer: true },
      orderBy: { pickupBy: 'asc' },
    }),
    prisma.medication.findMany({
      where: {
        birdId: { in: birdIds },
        OR: [{ stopDate: null }, { stopDate: { gt: now } }],
        refillDelivered: false,
      },
    }),
  ]);

  for (const e of events) {
    if (!e.birdId) continue;
    const snap = out.get(e.birdId);
    if (!snap) continue;
    snap.upcoming.push({
      kind: 'event', id: e.id, when: e.startsAt, title: e.title,
      detail: e.type.replace('_', ' '),
      href: `/calendar?day=${e.startsAt.toISOString().slice(0, 10)}`,
    });
  }
  for (const t of transports) {
    // PR C: same nullable handling. Legacy rows still link via t.birdId;
    // new rows link via TransportRequestBird (not part of this query yet,
    // so they won't show in the per-bird snapshot until we extend the
    // fetch — out of scope for PR C MVP).
    if (!t.birdId) continue;
    const snap = out.get(t.birdId);
    if (!snap) continue;
    const when = effectivePickupTime(t);
    if (!when) continue;
    snap.upcoming.push({
      kind: 'transport', id: t.id, when,
      title: requestTitle(t),
      detail: t.volunteer ? `Driver: ${t.volunteer.name}` : 'UNASSIGNED',
      href: `/transport/requests/${t.id}`,
    });
  }
  for (const m of meds) {
    if (!m.birdId) continue;
    const snap = out.get(m.birdId);
    if (!snap) continue;
    const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
    if (!runout) continue;
    const days = Math.floor((runout.getTime() - now.getTime()) / 86400000);
    if (days <= 14) {
      snap.refills.push({ id: m.id, name: m.name, runout, daysUntil: days });
    }
  }
  for (const [, snap] of out) {
    snap.upcoming.sort((a, b) => a.when.getTime() - b.when.getTime());
    snap.refills.sort((a, b) => a.daysUntil - b.daysUntil);
  }
  return out;
}
