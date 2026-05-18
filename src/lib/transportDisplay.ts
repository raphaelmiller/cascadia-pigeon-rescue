// PR C: Display helpers for TransportRequest after the multi-stop refactor.
//
// Legacy rows (pre-PR-C) have fromAddress/toAddress/pickupBy populated and
// zero TransportStop rows. New rows leave the legacy fields null and rely
// on TransportStop[]. Both shapes have to render side-by-side in
// transport pages and the global calendar.
//
// These helpers give callers safe accessors that work for both shapes.

import type { TransportRequest, TransportStop } from '@prisma/client';

export type TransportLike =
  | (TransportRequest & { stops?: TransportStop[] | null })
  | TransportRequest;

/** Read a sortable list of stops, falling back to a synthetic 2-stop list
 *  built from the legacy fromAddress/toAddress/pickupBy fields. Returns
 *  empty array if neither shape has any data. */
export function effectiveStops(t: TransportLike): Array<{
  id: string;
  kind: 'pickup' | 'dropoff';
  location: string | null;
  timeStart: Date | null;
  timeEnd: Date | null;
  notes: string | null;
  sortOrder: number;
  synthetic: boolean;
}> {
  const stops = (t as TransportRequest & { stops?: TransportStop[] }).stops;
  if (stops && stops.length > 0) {
    return stops
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        id: s.id,
        kind: s.kind === 'dropoff' ? 'dropoff' : 'pickup',
        location: s.location,
        timeStart: s.timeStart,
        timeEnd: s.timeEnd,
        notes: s.notes,
        sortOrder: s.sortOrder,
        synthetic: false,
      }));
  }
  // Legacy fallback: build pickup + dropoff from the flat columns.
  const out: ReturnType<typeof effectiveStops> = [];
  if (t.fromAddress || t.pickupBy) {
    out.push({
      id: `${t.id}#legacy-pickup`,
      kind: 'pickup',
      location: t.fromAddress,
      timeStart: t.pickupBy,
      timeEnd: null,
      notes: null,
      sortOrder: 0,
      synthetic: true,
    });
  }
  if (t.toAddress || t.deliverBy) {
    out.push({
      id: `${t.id}#legacy-dropoff`,
      kind: 'dropoff',
      location: t.toAddress,
      timeStart: t.deliverBy,
      timeEnd: null,
      notes: null,
      sortOrder: 1,
      synthetic: true,
    });
  }
  return out;
}

/** First scheduled time across all stops (used as the request's "anchor"
 *  for calendar grouping when explicit pickupBy is null). */
export function effectivePickupTime(t: TransportLike): Date | null {
  if (t.pickupBy) return t.pickupBy;
  const stops = (t as TransportRequest & { stops?: TransportStop[] }).stops;
  if (stops && stops.length > 0) {
    const times = stops
      .filter((s) => s.kind === 'pickup' && s.timeStart)
      .map((s) => s.timeStart as Date);
    if (times.length > 0) return new Date(Math.min(...times.map((d) => d.getTime())));
    const anyTime = stops.find((s) => s.timeStart);
    if (anyTime?.timeStart) return anyTime.timeStart;
  }
  return null;
}

/** One-line "From → To" summary for tight list views. Truncates each side
 *  to ~16 chars, returns "(location TBD)" when missing. */
export function summarizeRoute(t: TransportLike, eachMax = 16): string {
  const stops = effectiveStops(t);
  if (stops.length === 0) return '(no stops yet)';
  const firstPickup = stops.find((s) => s.kind === 'pickup');
  const lastDropoff = [...stops].reverse().find((s) => s.kind === 'dropoff');
  const fromLabel = firstPickup?.location ?? '(TBD)';
  const toLabel = lastDropoff?.location ?? '(TBD)';
  const trimmed = (s: string) => (s.length > eachMax ? s.slice(0, eachMax) + '…' : s);
  // If there are multiple pickups or dropoffs, add a "+N" suffix.
  const pickupCount = stops.filter((s) => s.kind === 'pickup').length;
  const dropoffCount = stops.filter((s) => s.kind === 'dropoff').length;
  const fromSuffix = pickupCount > 1 ? ` +${pickupCount - 1}` : '';
  const toSuffix = dropoffCount > 1 ? ` +${dropoffCount - 1}` : '';
  return `${trimmed(fromLabel)}${fromSuffix} → ${trimmed(toLabel)}${toSuffix}`;
}

/** Display title for the request — uses title if present, otherwise the
 *  legacy "From → To" summary, otherwise a generic fallback. */
export function requestTitle(t: TransportLike): string {
  if (t.title && t.title.trim()) return t.title;
  const stops = effectiveStops(t);
  if (stops.length > 0) return summarizeRoute(t, 24);
  return 'Transport job';
}

/** True if this is a legacy single-stop row (has fromAddress, no stops). */
export function isLegacyRequest(
  t: TransportLike,
): t is TransportRequest & { stops?: TransportStop[] } {
  const stops = (t as TransportRequest & { stops?: TransportStop[] }).stops;
  const hasNewStops = !!stops && stops.length > 0;
  const hasLegacyFields = !!(t.fromAddress || t.toAddress || t.pickupBy);
  return !hasNewStops && hasLegacyFields;
}
