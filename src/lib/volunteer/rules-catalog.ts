// Phase 2 -- catalog of recognized event kinds with default point
// values. Used by:
//   1. scripts/seed-rules.mjs to populate PointRule rows on first run
//   2. The admin /volunteers/rules UI as the source of truth for
//      "what rules exist"
//   3. evaluateRule() in rules.ts as the fallback when no PointRule
//      row exists yet (treat as enabled=false, points=0)
//
// All suggested points are conservative starting values. Christina will
// tune them after collecting volunteer summaries -- that's the explicit
// Phase 2 launch process per the conversation.

export type RuleCategory =
  | 'rescue' | 'transport' | 'foster' | 'check_in'
  | 'coordination' | 'historical';

export type RuleSeed = {
  kind: string;
  label: string;
  description: string;
  category: RuleCategory;
  suggestedPoints: number;
  // Default `enabled` is always false for fresh seeds.
};

export const RULES_CATALOG: RuleSeed[] = [
  // ---- Rescue ----
  {
    kind: 'rescue.claim_point_person',
    label: 'Claim Point Person on a rescue',
    description: 'First volunteer to claim ownership of a rescue case.',
    category: 'rescue',
    suggestedPoints: 3,
  },
  {
    kind: 'rescue.resolved_rescued',
    label: 'Successful rescue',
    description: 'Bird successfully rescued and brought into care.',
    category: 'rescue',
    suggestedPoints: 10,
  },
  {
    kind: 'rescue.resolved_escaped',
    label: 'Rescue attempt - bird escaped',
    description: 'Volunteer attempted the rescue; bird flew off / could not be caught.',
    category: 'rescue',
    suggestedPoints: 3,
  },
  {
    kind: 'rescue.resolved_unable',
    label: 'Rescue closed unable',
    description: 'Volunteer arrived; rescue could not proceed (wrong info, public space access, etc.).',
    category: 'rescue',
    suggestedPoints: 1,
  },
  {
    kind: 'rescue.decline',
    label: 'Rescue declined',
    description: 'Volunteer marked Unavailable on a rescue assignment. Audit-only.',
    category: 'rescue',
    suggestedPoints: 0,
  },
  {
    kind: 'rescue.figured_out',
    label: 'Marked rescue figured out',
    description: 'Coordinator or Point Person tapped Figured Out without resolving (close escalations).',
    category: 'rescue',
    suggestedPoints: 0,
  },
  {
    kind: 'rescue.emergency_response',
    label: 'Emergency rescue response (within 30 min)',
    description: 'Bonus for responding to an emergency-flagged rescue within 30 min of dispatch.',
    category: 'rescue',
    suggestedPoints: 5,
  },
  {
    kind: 'rescue.night_response',
    label: 'After-hours rescue (10pm-6am)',
    description: 'Bonus for handling a rescue between 10pm and 6am local time.',
    category: 'rescue',
    suggestedPoints: 5,
  },

  // ---- Transport ----
  {
    kind: 'transport.claim_point_person',
    label: 'Claim Point Person on a transport',
    description: 'First volunteer to claim a transport request.',
    category: 'transport',
    suggestedPoints: 3,
  },
  {
    kind: 'transport.in_transit',
    label: 'Pickup completed (in transit)',
    description: 'Volunteer picked up the bird and is en route. State change only.',
    category: 'transport',
    suggestedPoints: 2,
  },
  {
    kind: 'transport.delivered',
    label: 'Transport delivered',
    description: 'Volunteer completed delivery.',
    category: 'transport',
    suggestedPoints: 5,
  },
  {
    kind: 'transport.cancelled',
    label: 'Transport cancelled',
    description: 'Job cancelled (e.g. bird already moved, owner reclaimed). Audit-only.',
    category: 'transport',
    suggestedPoints: 0,
  },
  {
    kind: 'transport.decline',
    label: 'Transport declined',
    description: 'Volunteer marked Unavailable on a transport assignment. Audit-only.',
    category: 'transport',
    suggestedPoints: 0,
  },
  {
    kind: 'transport.figured_out',
    label: 'Marked transport figured out',
    description: 'Point Person tapped Figured Out on a transport.',
    category: 'transport',
    suggestedPoints: 0,
  },
  {
    kind: 'transport.long_haul',
    label: 'Long-haul transport (>50mi)',
    description: 'Bonus for transports over 50 miles total.',
    category: 'transport',
    suggestedPoints: 3,
  },
  {
    kind: 'transport.multi_stop',
    label: 'Multi-stop transport',
    description: 'Bonus for transports with 3+ stops.',
    category: 'transport',
    suggestedPoints: 2,
  },

  // ---- Foster ----
  {
    kind: 'foster.bird_intake',
    label: 'Took a bird into foster',
    description: 'Volunteer accepted a new bird into their foster care.',
    category: 'foster',
    suggestedPoints: 5,
  },
  {
    kind: 'foster.bird_weekly',
    label: 'Bird-week of foster',
    description: 'Per bird per week of active foster care (computed nightly).',
    category: 'foster',
    suggestedPoints: 7,
  },
  {
    kind: 'foster.bird_outcome_adopted',
    label: 'Foster bird adopted',
    description: 'A bird in this volunteer\u2019s care was adopted out.',
    category: 'foster',
    suggestedPoints: 10,
  },
  {
    kind: 'foster.bird_outcome_released',
    label: 'Foster bird released',
    description: 'A bird in this volunteer\u2019s care was successfully released.',
    category: 'foster',
    suggestedPoints: 8,
  },
  {
    kind: 'foster.bird_outcome_transferred',
    label: 'Foster bird transferred',
    description: 'A bird in this volunteer\u2019s care was transferred to a sanctuary.',
    category: 'foster',
    suggestedPoints: 5,
  },
  {
    kind: 'foster.long_term',
    label: 'Long-term foster milestone',
    description: 'Bonus for keeping a long-term bird (90+ days).',
    category: 'foster',
    suggestedPoints: 15,
  },
  {
    kind: 'foster.medical_handling',
    label: 'Advanced medical handling',
    description: 'Bird in care required advanced rehab (wound care, tube feeding, IM injections).',
    category: 'foster',
    suggestedPoints: 5,
  },
  {
    kind: 'foster.med_administered',
    label: 'Medication administered',
    description: 'Volunteer logged a medication round on a bird.',
    category: 'foster',
    suggestedPoints: 1,
  },

  // ---- Check-in ----
  {
    kind: 'foster.check_in',
    label: 'Foster daily check-in',
    description: 'Volunteer submitted a check-in on a foster bird. Auto-approved.',
    category: 'check_in',
    suggestedPoints: 1,
  },
  {
    kind: 'foster.check_in_streak_3',
    label: 'Check-in streak (3 days)',
    description: '3 consecutive days of check-ins.',
    category: 'check_in',
    suggestedPoints: 2,
  },
  {
    kind: 'foster.check_in_streak_7',
    label: 'Check-in streak (7 days)',
    description: '7 consecutive days of check-ins.',
    category: 'check_in',
    suggestedPoints: 5,
  },
  {
    kind: 'foster.check_in_concern',
    label: 'Concern flagged early',
    description: 'Volunteer flagged a concern that led to a coordinator response.',
    category: 'check_in',
    suggestedPoints: 3,
  },

  // ---- Coordination ----
  {
    kind: 'coordination.dispatch',
    label: 'Coordinator dispatched a job',
    description: 'A coordinator manually re-dispatched or claimed on behalf of a volunteer.',
    category: 'coordination',
    suggestedPoints: 1,
  },
  {
    kind: 'coordination.escalation_handled',
    label: 'Coordinator handled escalation',
    description: 'A coordinator picked up a job after T2 escalation.',
    category: 'coordination',
    suggestedPoints: 3,
  },
  {
    kind: 'coordination.point_approval',
    label: 'Coordinator approved a point claim',
    description: 'Coordinator approved a pending VolunteerEvent.',
    category: 'coordination',
    suggestedPoints: 0,
  },
  {
    kind: 'coordination.training',
    label: 'Hosted training session',
    description: 'Volunteer hosted or led a training session for new volunteers.',
    category: 'coordination',
    suggestedPoints: 10,
  },
  {
    kind: 'coordination.shift_lead',
    label: 'Led a shift',
    description: 'Acted as shift lead/coordinator-on-duty for a shift block.',
    category: 'coordination',
    suggestedPoints: 5,
  },
  {
    kind: 'coordination.docs_update',
    label: 'Updated docs / protocols',
    description: 'Volunteer contributed to documentation, protocols, or how-tos.',
    category: 'coordination',
    suggestedPoints: 3,
  },
  {
    kind: 'coordination.supply_run',
    label: 'Supply run',
    description: 'Volunteer made a supply run (food, meds, equipment).',
    category: 'coordination',
    suggestedPoints: 3,
  },
  {
    kind: 'coordination.vet_liaison',
    label: 'Vet liaison work',
    description: 'Volunteer acted as vet liaison for an appointment or paperwork.',
    category: 'coordination',
    suggestedPoints: 3,
  },
  {
    kind: 'coordination.intake_assist',
    label: 'Assisted with intake',
    description: 'Volunteer helped with bird intake / triage at HQ.',
    category: 'coordination',
    suggestedPoints: 3,
  },

  // ---- Historical (one-time grants) ----
  {
    kind: 'historical.years_of_service',
    label: 'Years of service grant',
    description: 'One-time historical grant per year of active volunteering.',
    category: 'historical',
    suggestedPoints: 25,
  },
  {
    kind: 'historical.major_contribution',
    label: 'Major historical contribution',
    description: 'One-time grant for past major contribution (notable rescue, long-term lead).',
    category: 'historical',
    suggestedPoints: 50,
  },
  {
    kind: 'historical.fundraising',
    label: 'Historical fundraising',
    description: 'Past fundraising contribution.',
    category: 'historical',
    suggestedPoints: 10,
  },
  {
    kind: 'historical.public_outreach',
    label: 'Historical public outreach',
    description: 'Past social media / outreach work.',
    category: 'historical',
    suggestedPoints: 10,
  },
  {
    kind: 'historical.foster_career',
    label: 'Historical foster career',
    description: 'Past foster work pre-portal.',
    category: 'historical',
    suggestedPoints: 30,
  },
  {
    kind: 'historical.adjustment',
    label: 'Manual adjustment',
    description: 'Catch-all for coordinator-issued bonus / penalty.',
    category: 'historical',
    suggestedPoints: 0,
  },
];

export const CATEGORY_ORDER: RuleCategory[] = [
  'rescue', 'transport', 'foster', 'check_in', 'coordination', 'historical',
];

export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  rescue: '🚨 Rescue',
  transport: '🚚 Transport',
  foster: '🐦 Foster',
  check_in: '✅ Check-in',
  coordination: '🛠 Coordination',
  historical: '🏆 Historical',
};
