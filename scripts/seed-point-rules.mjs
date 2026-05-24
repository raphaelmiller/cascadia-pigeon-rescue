// Seed PointRule rows from the rules-catalog. Idempotent:
//   - Inserts rows that don't yet exist (with enabled=false).
//   - Does NOT overwrite Christina's edits (label, description,
//     suggestedPoints, category are updated; `points` and `enabled` are
//     only set on first insert).
//
// Re-run any time the catalog gains new rules.

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

// We can't import the TS catalog directly from a .mjs script in this
// project setup; the cleanest workaround is to ship a JSON snapshot
// alongside the catalog and consume that. For now, re-define the kinds
// inline so the seed doesn't require a build step.
const CATALOG = [
  // Keep these in sync with src/lib/volunteer/rules-catalog.ts.
  ['rescue.claim_point_person',     'Claim Point Person on a rescue',  'rescue', 3, 'First volunteer to claim ownership of a rescue case.'],
  ['rescue.resolved_rescued',       'Successful rescue',                'rescue', 10, 'Bird successfully rescued and brought into care.'],
  ['rescue.resolved_escaped',       'Rescue attempt - bird escaped',    'rescue', 3, 'Volunteer attempted the rescue; bird flew off / could not be caught.'],
  ['rescue.resolved_deceased',      'Bird found deceased',              'rescue', 5, 'PR J (2026-05-24): bird died at the scene or was found already deceased. Creates memorial Bird record.'],
  ['rescue.resolved_unable',        'Rescue closed unable (admin)',     'rescue', 1, 'Admin-only terminal close. Volunteer-side "unable" now escalates via rescue.unable_passed.'],
  ['rescue.unable_passed',          'Rescue passed — honest hand-off',  'rescue', 1, 'PR H (2026-05-24): auto-banked for posting an honest hand-off note when escalating an Unable rescue.'],
  ['rescue.unable_high_effort',     'Rescue passed — high-effort (review)', 'rescue', 2, 'PR J (2026-05-24): bonus for high-effort Unable attempts. Goes through coordinator review.'],
  ['rescue.field_note',             'Rescue field note',                'rescue', 1, 'Volunteer added a written note (context for next responder / social). Capped per case.'],
  ['rescue.field_photo',            'Rescue field photo',               'rescue', 2, 'Volunteer attached a photo on a rescue case. Capped per case.'],
  ['rescue.decline',                'Rescue declined',                  'rescue', 0, 'Volunteer marked Unavailable on a rescue assignment. Audit-only.'],
  ['rescue.figured_out',            'Marked rescue figured out',        'rescue', 0, 'Coordinator or Point Person tapped Figured Out without resolving.'],
  ['rescue.emergency_response',     'Emergency rescue response',        'rescue', 5, 'Bonus for responding to an emergency-flagged rescue within 30 min.'],
  ['rescue.night_response',         'After-hours rescue',               'rescue', 5, 'Bonus for handling a rescue between 10pm and 6am local time.'],
  ['transport.claim_point_person',  'Claim Point Person on a transport','transport', 3, 'First volunteer to claim a transport request.'],
  ['transport.in_transit',          'Pickup completed (in transit)',    'transport', 2, 'Volunteer picked up the bird and is en route.'],
  ['transport.delivered',           'Transport delivered',              'transport', 5, 'Volunteer completed delivery.'],
  ['transport.cancelled',           'Transport cancelled',              'transport', 0, 'Job cancelled. Audit-only.'],
  ['transport.decline',             'Transport declined',               'transport', 0, 'Volunteer marked Unavailable. Audit-only.'],
  ['transport.figured_out',         'Marked transport figured out',     'transport', 0, 'Point Person tapped Figured Out on a transport.'],
  ['transport.long_haul',           'Long-haul transport (>50mi)',      'transport', 3, 'Bonus for transports over 50 miles total.'],
  ['transport.multi_stop',          'Multi-stop transport',             'transport', 2, 'Bonus for transports with 3+ stops.'],
  ['foster.bird_intake',            'Took a bird into foster',          'foster', 5, 'Volunteer accepted a new bird.'],
  ['foster.bird_weekly',            'Bird-week of foster',              'foster', 7, 'Per bird per week of active foster care.'],
  ['foster.bird_outcome_adopted',   'Foster bird adopted',              'foster', 10, 'A bird in this volunteer\'s care was adopted out.'],
  ['foster.bird_outcome_released',  'Foster bird released',             'foster', 8, 'A bird in this volunteer\'s care was successfully released.'],
  ['foster.bird_outcome_transferred','Foster bird transferred',         'foster', 5, 'A bird in this volunteer\'s care was transferred.'],
  ['foster.long_term',              'Long-term foster milestone',       'foster', 15, 'Bonus for 90+ days of long-term care.'],
  ['foster.medical_handling',       'Advanced medical handling',        'foster', 5, 'Bird required advanced rehab.'],
  ['foster.med_administered',       'Medication administered',          'foster', 1, 'Volunteer logged a medication round.'],
  ['foster.check_in',               'Foster daily check-in',            'check_in', 1, 'Volunteer submitted a check-in. Auto-approved.'],
  ['foster.check_in_streak_3',      'Check-in streak (3 days)',         'check_in', 2, '3 consecutive days of check-ins.'],
  ['foster.check_in_streak_7',      'Check-in streak (7 days)',         'check_in', 5, '7 consecutive days of check-ins.'],
  ['foster.check_in_concern',       'Concern flagged early',            'check_in', 3, 'Volunteer flagged a concern that led to a coordinator response.'],
  ['coordination.dispatch',         'Coordinator dispatched a job',     'coordination', 1, 'Coordinator manually re-dispatched or claimed.'],
  ['coordination.escalation_handled','Coordinator handled escalation',  'coordination', 3, 'Coordinator picked up a job after T2 escalation.'],
  ['coordination.point_approval',   'Coordinator approved a point claim','coordination', 0, 'Coordinator approved a pending VolunteerEvent.'],
  ['coordination.training',         'Hosted training session',          'coordination', 10, 'Volunteer hosted or led a training session.'],
  ['coordination.shift_lead',       'Led a shift',                      'coordination', 5, 'Acted as shift lead.'],
  ['coordination.docs_update',      'Updated docs / protocols',         'coordination', 3, 'Contributed to documentation.'],
  ['coordination.supply_run',       'Supply run',                       'coordination', 3, 'Made a supply run.'],
  ['coordination.vet_liaison',      'Vet liaison work',                 'coordination', 3, 'Acted as vet liaison.'],
  ['coordination.intake_assist',    'Assisted with intake',             'coordination', 3, 'Helped with bird intake at HQ.'],
  ['historical.years_of_service',   'Years of service grant',           'historical', 25, 'One-time grant per year of active volunteering.'],
  ['historical.major_contribution', 'Major historical contribution',    'historical', 50, 'One-time grant for past major contribution.'],
  ['historical.fundraising',        'Historical fundraising',           'historical', 10, 'Past fundraising contribution.'],
  ['historical.public_outreach',    'Historical public outreach',       'historical', 10, 'Past social media / outreach work.'],
  ['historical.foster_career',      'Historical foster career',         'historical', 30, 'Past foster work pre-portal.'],
  ['historical.adjustment',         'Manual adjustment',                'historical', 0, 'Catch-all for coordinator-issued bonus / penalty.'],
];

let inserted = 0, updatedMeta = 0;
for (const [kind, label, category, suggested, description] of CATALOG) {
  const existing = await prisma.pointRule.findUnique({ where: { kind } });
  if (existing) {
    // Keep `points` and `enabled` (Christina's edits) untouched; refresh
    // metadata fields only.
    await prisma.pointRule.update({
      where: { kind },
      data: { label, category, description, suggestedPoints: suggested },
    });
    updatedMeta++;
  } else {
    await prisma.pointRule.create({
      data: {
        kind, label, category, description,
        suggestedPoints: suggested,
        points: suggested, // start matching suggested; admin can tune
        enabled: false,    // disabled by default until Christina turns on
      },
    });
    inserted++;
  }
}
console.log(`PointRule seed: inserted ${inserted}, refreshed ${updatedMeta}, total ${CATALOG.length}`);
await prisma.$disconnect();
