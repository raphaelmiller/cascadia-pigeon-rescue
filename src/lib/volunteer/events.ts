// VolunteerEvent logger.
//
// Phase 1 wrote pointDelta values inline at every call site (e.g. +3 for
// claiming Point Person). Phase 2 introduces the PointRule table -- now
// the same call goes through evaluateRule() which can:
//   - look up the per-kind rule
//   - apply enable/disable state
//   - apply per-rule autoApproveMax override
//
// Backward compat: callers passing `pointDelta` get that value verbatim
// (treated as an override). Callers omitting `pointDelta` get the rule's
// configured value. Approval status is computed the same way either way.

import { prisma } from '@/lib/prisma';
import { evaluateRule } from './rules';

export type LogEventArgs = {
  profileId: string;
  category: 'rescue' | 'transport' | 'foster' | 'check_in' | 'admin' | 'system';
  kind: string;
  /**
   * Optional. If supplied, treated as an override -- the rule for `kind`
   * is consulted only for autoApproveMax (if any). If omitted, the
   * rule's configured `points` value is used.
   */
  pointDelta?: number;
  refType?: string;
  refId?: string;
  notes?: string;
  /** Force the approval status (overrides rule + auto-threshold). */
  approvalStatus?: 'auto' | 'pending' | 'approved' | 'rejected' | 'adjusted';
};

export async function logEvent(args: LogEventArgs): Promise<{ id: string; pointDelta: number; approvalStatus: string }> {
  const verdict = await evaluateRule({ kind: args.kind, pointDeltaOverride: args.pointDelta });
  const finalStatus = args.approvalStatus ?? verdict.approvalStatus;

  const row = await prisma.volunteerEvent.create({
    data: {
      profileId: args.profileId,
      category: args.category,
      kind: args.kind,
      pointDelta: verdict.pointDelta,
      approvalStatus: finalStatus,
      refType: args.refType ?? null,
      refId: args.refId ?? null,
      notes: args.notes ?? null,
    },
    select: { id: true },
  });
  return { id: row.id, pointDelta: verdict.pointDelta, approvalStatus: finalStatus };
}

/**
 * Sum approved + auto points for a profile.
 */
export async function totalPoints(profileId: string): Promise<number> {
  const agg = await prisma.volunteerEvent.aggregate({
    where: {
      profileId,
      approvalStatus: { in: ['auto', 'approved', 'adjusted'] },
    },
    _sum: { pointDelta: true },
  });
  return agg._sum.pointDelta ?? 0;
}

/**
 * Per-volunteer event count + breakdown by category. Used by the
 * service-record page.
 */
export async function eventBreakdown(profileId: string): Promise<{
  byCategory: Record<string, number>;
  totalEvents: number;
  totalPoints: number;
}> {
  const rows = await prisma.volunteerEvent.findMany({
    where: { profileId, approvalStatus: { in: ['auto', 'approved', 'adjusted'] } },
    select: { category: true, pointDelta: true },
  });
  const byCategory: Record<string, number> = {};
  let totalPoints = 0;
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.pointDelta;
    totalPoints += r.pointDelta;
  }
  return { byCategory, totalEvents: rows.length, totalPoints };
}
