// Phase 2 rule evaluation. Called by logEvent() to compute the actual
// pointDelta + approvalStatus for an event based on the current PointRule
// row for its kind.
//
// Behavior:
//   - PointRule row exists, enabled=true: returns row.points, applies
//     per-rule autoApproveMax if set else global POINT_AUTO_APPROVE_MAX.
//   - PointRule row exists, enabled=false: returns 0 (audit-only).
//   - No PointRule row (catalog out of sync, or a new kind not yet
//     seeded): returns 0 (audit-only). Christina sees it as a "?" in the
//     rules UI and can add a row.
//   - Caller-supplied pointDelta override: respected verbatim (used by
//     the dispatch engine's claim bonus which was hardcoded at +3 in
//     Phase 1; once the corresponding rule is enabled, the override is
//     superseded).
//
// Note: legacy callers passing pointDelta still work; the rule lookup
// is best-effort. This gives us a clean Phase 1 -> Phase 2 transition
// without breaking anything.

import { prisma } from '@/lib/prisma';

const DEFAULT_AUTO_MAX = 5;

function globalAutoMax(): number {
  const n = Number(process.env.POINT_AUTO_APPROVE_MAX ?? DEFAULT_AUTO_MAX);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AUTO_MAX;
}

export type RuleVerdict = {
  pointDelta: number;
  approvalStatus: 'auto' | 'pending';
  // For debugging / audit: did the rule fire, or did we fall through?
  source: 'rule' | 'disabled' | 'missing' | 'override';
};

export async function evaluateRule(args: {
  kind: string;
  // If non-null/undefined, the caller is overriding the rule; we use
  // the override value and only consult the rule for autoApproveMax.
  pointDeltaOverride?: number;
}): Promise<RuleVerdict> {
  const { kind, pointDeltaOverride } = args;
  const rule = await prisma.pointRule.findUnique({ where: { kind } });

  // Override path: caller knows what they want; we just decide approval.
  if (typeof pointDeltaOverride === 'number') {
    const threshold = rule?.autoApproveMax ?? globalAutoMax();
    const approvalStatus = Math.abs(pointDeltaOverride) <= threshold ? 'auto' : 'pending';
    return { pointDelta: pointDeltaOverride, approvalStatus, source: 'override' };
  }

  if (!rule) {
    return { pointDelta: 0, approvalStatus: 'auto', source: 'missing' };
  }
  if (!rule.enabled) {
    return { pointDelta: 0, approvalStatus: 'auto', source: 'disabled' };
  }
  const threshold = rule.autoApproveMax ?? globalAutoMax();
  const approvalStatus = Math.abs(rule.points) <= threshold ? 'auto' : 'pending';
  return { pointDelta: rule.points, approvalStatus, source: 'rule' };
}
