// Rich dummy-data seed for dev / demo / Rafa walkthrough.
//
// Layers on top of `seed-volunteer-portal.mjs`. Adds:
//   • 8 additional volunteer personas covering every role tag
//   • A pool of rescue cases in every state (needs_rescue, point-person-claimed,
//     escalated, escaped, rescued-w/-bird, deceased-w/-memorial, closed_unable)
//   • Transport requests in open / in_transit / delivered
//   • Birds in foster care + a few archive records
//   • Foster check-ins (some 'watching', some 'concern') so the new
//     /dispatch/concerns feed isn't empty
//   • Daily updates with high stress scores → also feeds concerns
//   • A pile of VolunteerEvents to make the recognition / points pages
//     have real data
//
// Idempotent: re-running it does NOT duplicate volunteers, birds, or
// rescue cases. It uses email / case description / bird name as
// natural keys.
//
// USAGE
//   DATABASE_URL=file:./prisma/dev.db node scripts/seed-dummy-rich.mjs
//
// Or against prod (be sure you actually want test data in prod):
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/seed-dummy-rich.mjs

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

const now = new Date();
const minsAgo = (n) => new Date(now.getTime() - n * 60 * 1000);
const hoursAgo = (n) => new Date(now.getTime() - n * 60 * 60 * 1000);
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

// =====================================================================
// 1. Additional volunteers — one of each broad persona.
// =====================================================================

const VOLUNTEERS = [
  // Foster only — bread-and-butter foster
  {
    email: 'jamie@example.com', name: 'Jamie Chen', phone: '+15035550110',
    roleTags: 'foster', isCoordinator: false,
    foster: {
      capacity: 3, medicalSkill: 'beginner',
      address: '2100 N Williams Ave, Portland, OR 97227',
      longTermAble: false,
      skillOralMeds: true, skillEnrichment: true, skillCageTime: true,
    },
  },
  // Foster + med_admin — medical foster
  {
    email: 'priya@example.com', name: 'Priya Sharma', phone: '+15035550111',
    roleTags: 'foster,med_admin,lead_foster', isCoordinator: false,
    foster: {
      capacity: 5, medicalSkill: 'advanced',
      address: '6204 SE Foster Rd, Portland, OR 97206',
      longTermAble: true,
      skillOralMeds: true, skillSyringeFeed: true, skillTubeFeed: true,
      skillSubqFluids: true, skillIMInjections: true, skillCompoundMeds: true,
      skillWoundCare: true, skillFootBandages: true, skillMedKnowledge: true,
      skillNeonates: true, skillEmaciationCare: true, skillEnrichment: true,
    },
  },
  // Transport-only driver
  {
    email: 'marcus@example.com', name: 'Marcus Brown', phone: '+15035550112',
    roleTags: 'transport', isCoordinator: false,
    transport: {
      vehicleType: 'Sedan', maxDistanceMi: 40,
      location: 'N Portland', medicalCapable: false,
    },
  },
  // Long-haul transport + supply runner
  {
    email: 'leila@example.com', name: 'Leila Okonkwo', phone: '+15035550113',
    roleTags: 'transport,supply_runner', isCoordinator: false,
    transport: {
      vehicleType: 'Pickup truck', maxDistanceMi: 250,
      location: 'Beaverton', medicalCapable: true,
    },
  },
  // Rescue-only field volunteer
  {
    email: 'devon@example.com', name: 'Devon Walsh', phone: '+15035550114',
    roleTags: 'rescue', isCoordinator: false,
    rescue: {
      location: 'SW Portland',
      skills: 'Netting, basic restraint. Comfortable with feral pigeons.',
      emergencyResponse: false,
    },
  },
  // Senior rescuer + emergency response
  {
    email: 'aria@example.com', name: 'Aria Nakamura', phone: '+15035550115',
    roleTags: 'rescue,rescue_lead,intake', isCoordinator: false,
    rescue: {
      location: 'SE Portland',
      skills: 'Senior rescuer. Ladder, climbing, wing/leg restraint, triage. Also helps with intake at HQ.',
      emergencyResponse: true,
    },
  },
  // Coordinator + vet liaison — not a hands-on volunteer
  {
    email: 'noor@example.com', name: 'Noor Patel', phone: '+15035550116',
    roleTags: 'coordinator,vet_liaison,data_entry', isCoordinator: true,
    // No foster/transport/rescue — pure ops.
  },
  // Social media + fundraising — outreach persona
  {
    email: 'ezra@example.com', name: 'Ezra Goldberg', phone: '+15035550117',
    roleTags: 'social_media,fundraising', isCoordinator: false,
  },
];

async function upsertFoster(email, name, phone, data) {
  if (!data) return null;
  const existing = await prisma.foster.findFirst({ where: { email } });
  if (existing) {
    return prisma.foster.update({
      where: { id: existing.id },
      data: { name, phone, email, ...data },
    });
  }
  return prisma.foster.create({ data: { name, phone, email, ...data } });
}

async function upsertTransport(email, name, phone, data) {
  if (!data) return null;
  const existing = await prisma.transportVolunteer.findFirst({ where: { email } });
  if (existing) {
    return prisma.transportVolunteer.update({
      where: { id: existing.id },
      data: { name, phone, email, ...data },
    });
  }
  return prisma.transportVolunteer.create({ data: { name, phone, email, ...data } });
}

async function upsertRescue(email, name, phone, data) {
  if (!data) return null;
  const existing = await prisma.rescueVolunteer.findFirst({ where: { email } });
  if (existing) {
    return prisma.rescueVolunteer.update({
      where: { id: existing.id },
      data: { name, phone, email, ...data },
    });
  }
  return prisma.rescueVolunteer.create({ data: { name, phone, email, ...data } });
}

async function seedVolunteers() {
  console.log('\n=== Volunteers ===');
  const out = {};
  for (const s of VOLUNTEERS) {
    const [foster, transport, rescue] = await Promise.all([
      upsertFoster(s.email, s.name, s.phone, s.foster),
      upsertTransport(s.email, s.name, s.phone, s.transport),
      upsertRescue(s.email, s.name, s.phone, s.rescue),
    ]);
    const data = {
      email: s.email, name: s.name, phone: s.phone,
      roleTags: s.roleTags, isCoordinator: s.isCoordinator,
      invitedAt: new Date(),
      fosterId: foster?.id ?? null,
      transportId: transport?.id ?? null,
      rescueId: rescue?.id ?? null,
    };
    const existing = await prisma.volunteerProfile.findUnique({ where: { email: s.email } });
    let profile;
    if (existing) {
      profile = await prisma.volunteerProfile.update({ where: { id: existing.id }, data });
      console.log(`updated  ${s.email.padEnd(28)}  roles=${s.roleTags}`);
    } else {
      profile = await prisma.volunteerProfile.create({ data });
      console.log(`created  ${s.email.padEnd(28)}  roles=${s.roleTags}`);
    }
    out[s.email] = { profile, foster, transport, rescue };
  }
  return out;
}

// =====================================================================
// 2. Birds — a mix of statuses, including some in foster care.
// =====================================================================

const BIRD_SEEDS = [
  // Active in foster
  { name: 'Pip',     species: 'Pigeon', status: 'in_foster', fosterEmail: 'maya@example.com',  behaviorNotes: 'Found at parking garage with bumblefoot. Comfortable being handled. Loves millet.' },
  { name: 'Olive',   species: 'Dove',   status: 'in_foster', fosterEmail: 'priya@example.com', behaviorNotes: 'Subcutaneous fluids daily, oral antibiotic 2x/day. Eating on her own.' },
  { name: 'Marbles', species: 'Pigeon', status: 'in_foster', fosterEmail: 'priya@example.com', behaviorNotes: 'Recovering from wing fracture. Cage rest. Light enrichment.' },
  { name: 'Coco',    species: 'Pigeon', status: 'in_foster', fosterEmail: 'sam@example.com',   behaviorNotes: 'Found emaciated under bridge. Recovery: slow weight gain plan.' },
  // Needs intake (just rescued, not yet placed)
  { name: 'Ash',     species: 'Pigeon', status: 'needs_intake',                                behaviorNotes: 'Rescued today from Powell Books area. Possible head trauma, alert but stunned. Needs vet eval.' },
  // Released
  { name: 'Sparrow', species: 'Pigeon', status: 'released',                                    behaviorNotes: 'Rehabbed Apr–May 2026. Released near original found location. Flew strong.' },
  // Adopted out
  { name: 'Theo',    species: 'Dove',   status: 'adopted',                                     behaviorNotes: 'Adopted by Murphy household, 4/12. Lives with companion dove.' },
];

async function seedBirds(volunteers) {
  console.log('\n=== Birds ===');
  const out = {};
  for (const b of BIRD_SEEDS) {
    const foster = b.fosterEmail ? volunteers[b.fosterEmail]?.foster : null;
    const existing = await prisma.bird.findFirst({ where: { name: b.name } });
    const data = {
      name: b.name, species: b.species, status: b.status,
      behaviorNotes: b.behaviorNotes,
      fosterId: foster?.id ?? null,
    };
    let row;
    if (existing) {
      row = await prisma.bird.update({ where: { id: existing.id }, data });
      console.log(`updated  ${b.name.padEnd(10)}  status=${b.status}  foster=${b.fosterEmail ?? '—'}`);
    } else {
      row = await prisma.bird.create({ data });
      console.log(`created  ${b.name.padEnd(10)}  status=${b.status}  foster=${b.fosterEmail ?? '—'}`);
    }
    out[b.name] = row;
  }
  return out;
}

// =====================================================================
// 3. Rescue cases — a wide spread of states.
// =====================================================================

const RESCUE_CASES = [
  // 1. Brand-new, no point person yet
  {
    birdDescription: 'gray pigeon, possible foot injury',
    issue: 'Limping under park bench, won\'t fly. Possibly bumblefoot.',
    location: 'Lan Su Chinese Garden, NW Couch',
    reporterName: 'Tom Henley', reporterPhone: '+15035551001',
    status: 'needs_rescue', emergencyFlag: false,
    pointPersonEmail: null,
    dateCalledIn: minsAgo(35),
    updates: [],
  },
  // 2. Emergency-flagged, no point person
  {
    birdDescription: 'pigeon trapped in netting',
    issue: 'Bird hanging from anti-bird netting on building. Visible distress, needs rescue ASAP.',
    location: '3rd & Burnside, alley behind Voodoo Doughnut',
    reporterName: 'Sasha Lim', reporterPhone: '+15035551002',
    status: 'needs_rescue', emergencyFlag: true,
    pointPersonEmail: null,
    dateCalledIn: minsAgo(15),
    updates: [],
  },
  // 3. Active case w/ point person, fresh
  {
    birdDescription: 'juvenile dove',
    issue: 'On the ground, fluttering but not flying. Cat nearby earlier.',
    location: 'Backyard at 4521 NE 28th Ave',
    reporterName: 'Maya Rivers', reporterPhone: '+15035550101',
    status: 'needs_rescue', emergencyFlag: false,
    pointPersonEmail: 'theo@example.com',
    pointPersonClaimedMinAgo: 8,
    dateCalledIn: minsAgo(25),
    updates: [
      { text: 'On my way. ETA 15 min.', category: 'volunteer_note', authorEmail: 'theo@example.com', attemptedMinAgo: 7 },
    ],
  },
  // 4. Active case where PP has gone silent (>20 min) — unlocks take-over
  {
    birdDescription: 'white pigeon, fancy breed',
    issue: 'Lost / domestic bird in park. Approaching people, won\'t survive long outside.',
    location: 'Mt. Tabor Park, near picnic area',
    reporterName: 'Jordan Reeves', reporterPhone: '+15035551003',
    status: 'needs_rescue', emergencyFlag: false,
    pointPersonEmail: 'devon@example.com',
    pointPersonClaimedMinAgo: 35,  // > 20 min routine threshold
    dateCalledIn: hoursAgo(2),
    updates: [
      { text: 'Heading there now.', category: 'volunteer_note', authorEmail: 'devon@example.com', attemptedMinAgo: 34 },
      // No updates since, so the heartbeat fires
    ],
  },
  // 5. Escalated (volunteer hit "Unable" once) — tier 2 should open
  {
    birdDescription: 'pigeon, fishing-line tangled foot',
    issue: 'Foot caught in fishing line wrapped around branch. High up.',
    location: 'Holladay Park, east side trees',
    reporterName: 'Dani Pham', reporterPhone: '+15035551004',
    status: 'needs_rescue', emergencyFlag: false,
    pointPersonEmail: null,  // released by previous unable
    unableReason: 'Bird is ~20ft up in a tree, my 8-ft ladder won\'t reach. Need someone with climbing gear or fire-dept assist.',
    unablePassedCount: 1,
    dateCalledIn: hoursAgo(3),
    updates: [
      { text: 'On scene. Bird is ~20ft up.', category: 'volunteer_note', authorEmail: 'devon@example.com', attemptedMinAgo: 90 },
      { text: 'Volunteer passed — couldn\'t rescue: Bird is ~20ft up in a tree, my 8-ft ladder won\'t reach. Need someone with climbing gear or fire-dept assist.', category: 'volunteer_note', authorEmail: 'devon@example.com', attemptedMinAgo: 85 },
    ],
  },
  // 6. Rescued — w/ a bird record created
  {
    birdDescription: 'pigeon found stunned by car',
    issue: 'Stunned but breathing, side of road. Driver pulled over to help.',
    location: 'NE Sandy Blvd & 39th Ave',
    reporterName: 'Erin Wallace', reporterPhone: '+15035551005',
    status: 'rescued', emergencyFlag: false,
    pointPersonEmail: 'aria@example.com',
    pointPersonClaimedMinAgo: 240,
    resolvedMinAgo: 210,
    dateCalledIn: hoursAgo(5),
    rescuedBirdName: 'Ash',
    updates: [
      { text: 'On scene. Bird is alert, eyes responsive. Bringing to HQ.', category: 'volunteer_note', authorEmail: 'aria@example.com', attemptedMinAgo: 230 },
      { text: 'Bird rescued + intake started → created Bird record "Ash"', category: 'system', authorEmail: 'aria@example.com', attemptedMinAgo: 210 },
    ],
  },
  // 7. Escaped — bird flew off before rescue
  {
    birdDescription: 'crow (will refer to wildlife center but tried first)',
    issue: 'On ground appearing injured.',
    location: 'Forest Park, Wildwood trailhead',
    reporterName: 'Quinn Anderson', reporterPhone: '+15035551006',
    status: 'escaped_flew_away', emergencyFlag: false,
    pointPersonEmail: 'aria@example.com',
    pointPersonClaimedMinAgo: 1440,  // yesterday
    resolvedMinAgo: 1380,
    dateCalledIn: daysAgo(1),
    updates: [
      { text: 'On scene. Crow flew off into the canopy. Watched 20 min, didn\'t come back down.', category: 'volunteer_note', authorEmail: 'aria@example.com', attemptedMinAgo: 1385 },
    ],
  },
  // 8. Deceased — bird was already gone when volunteer arrived
  {
    birdDescription: 'adult pigeon',
    issue: 'Reporter found bird already deceased. Looking for guidance on handling.',
    location: 'Sidewalk, NE Alberta & 18th',
    reporterName: 'Robin Jacobs', reporterPhone: '+15035551007',
    status: 'deceased', emergencyFlag: false,
    pointPersonEmail: 'theo@example.com',
    pointPersonClaimedMinAgo: 600,
    resolvedMinAgo: 540,
    dateCalledIn: hoursAgo(11),
    createsMemorialBird: { name: 'Memorial — Alberta St', species: 'Pigeon' },
    updates: [
      { text: 'On scene. Bird is deceased. No external trauma visible. Likely natural causes / window strike.', category: 'volunteer_note', authorEmail: 'theo@example.com', attemptedMinAgo: 545 },
      { text: 'Status changed → deceased. Memorial Bird record created.', category: 'system', authorEmail: 'theo@example.com', attemptedMinAgo: 540 },
    ],
  },
  // 9. Closed unable (admin-only path) — historical record
  {
    birdDescription: 'pigeon report (unconfirmed)',
    issue: 'Bird reported on rooftop, gone by the time anyone arrived.',
    location: '12th & Yamhill rooftop',
    reporterName: 'Anon caller', reporterPhone: '',
    status: 'closed_unable', emergencyFlag: false,
    pointPersonEmail: null,
    resolvedMinAgo: 2880,
    dateCalledIn: daysAgo(3),
    updates: [
      { text: 'Three volunteers checked over 2 hrs. No bird sighted. Closing.', category: 'admin', authorEmail: 'christina@cascadiapigeonrescue.org', attemptedMinAgo: 2880 },
    ],
  },
];

async function seedRescueCases(volunteers, birds) {
  console.log('\n=== Rescue cases ===');
  const out = [];
  for (const c of RESCUE_CASES) {
    // Use birdDescription + location as natural key.
    const existing = await prisma.rescueCase.findFirst({
      where: { birdDescription: c.birdDescription, location: c.location },
    });
    const pp = c.pointPersonEmail ? volunteers[c.pointPersonEmail]?.profile : null;
    let rescuedBird = c.rescuedBirdName ? birds[c.rescuedBirdName] : null;

    // Memorial bird creation (deceased path).
    if (c.createsMemorialBird && !rescuedBird) {
      const existingMemorial = await prisma.bird.findFirst({ where: { name: c.createsMemorialBird.name } });
      rescuedBird = existingMemorial ?? await prisma.bird.create({
        data: {
          name: c.createsMemorialBird.name,
          species: c.createsMemorialBird.species,
          status: 'deceased',
          foundLocation: c.location,
          finderName: c.reporterName,
          finderContact: c.reporterPhone,
          behaviorNotes: c.issue,
        },
      });
    }

    const data = {
      birdDescription: c.birdDescription,
      issue: c.issue,
      location: c.location,
      reporterName: c.reporterName,
      reporterPhone: c.reporterPhone,
      status: c.status,
      emergencyFlag: c.emergencyFlag,
      dateCalledIn: c.dateCalledIn,
      pointPersonId: pp?.id ?? null,
      pointPersonClaimedAt: c.pointPersonClaimedMinAgo ? minsAgo(c.pointPersonClaimedMinAgo) : null,
      resolvedAt: c.resolvedMinAgo ? minsAgo(c.resolvedMinAgo) : null,
      resolvedByProfileId: c.resolvedMinAgo && pp ? pp.id : null,
      rescuedBirdId: rescuedBird?.id ?? null,
      unableReason: c.unableReason ?? null,
      unablePassedCount: c.unablePassedCount ?? 0,
    };

    let caseRow;
    if (existing) {
      caseRow = await prisma.rescueCase.update({ where: { id: existing.id }, data });
      console.log(`updated  ${c.birdDescription.slice(0, 35).padEnd(35)}  ${c.status}`);
    } else {
      caseRow = await prisma.rescueCase.create({ data });
      console.log(`created  ${c.birdDescription.slice(0, 35).padEnd(35)}  ${c.status}`);
    }

    // Wipe + reseed timeline so re-runs don't duplicate timeline entries.
    await prisma.rescueCaseUpdate.deleteMany({ where: { caseId: caseRow.id } });
    for (const u of c.updates ?? []) {
      const author = volunteers[u.authorEmail]?.profile;
      await prisma.rescueCaseUpdate.create({
        data: {
          caseId: caseRow.id,
          text: u.text,
          category: u.category ?? 'system',
          authorProfileId: author?.id ?? null,
          attemptedAt: u.attemptedMinAgo ? minsAgo(u.attemptedMinAgo) : new Date(),
        },
      });
    }

    out.push(caseRow);
  }
  return out;
}

// =====================================================================
// 4. Foster check-ins — populate the concerns feed.
// =====================================================================

const CHECKINS = [
  // Recent — Maya, all good
  { profileEmail: 'maya@example.com', birdName: 'Pip', pulse: 'all_good', note: 'Pip is eating well, foot wrap clean, behavior normal.', minAgo: 60 },
  { profileEmail: 'maya@example.com', birdName: null,  pulse: 'all_good', note: '',                                                              minAgo: 60 * 24 },
  // Priya — watching (treatment going OK but ambiguous progress)
  { profileEmail: 'priya@example.com', birdName: 'Olive', pulse: 'watching', note: 'Olive is eating but slower than yesterday. Still alert. Will reassess in morning.', minAgo: 120 },
  // Priya — concern (high stakes)
  { profileEmail: 'priya@example.com', birdName: 'Marbles', pulse: 'concern', note: 'Marbles is not putting weight on the fractured wing side at all today. Was using it slightly yesterday. Should we get a vet recheck?', minAgo: 30 },
  // Sam — all good
  { profileEmail: 'sam@example.com', birdName: 'Coco', pulse: 'all_good', note: 'Coco gained 8g this week. Eating consistently.', minAgo: 60 * 12 },
  // Jamie — watching, new foster getting nervous
  { profileEmail: 'jamie@example.com', birdName: null, pulse: 'watching', note: 'No birds in care right now but wanted to test the check-in flow.', minAgo: 60 * 6 },
];

async function seedCheckIns(volunteers, birds) {
  console.log('\n=== Foster check-ins ===');
  // Wipe old seed-tagged check-ins by author+createdAt window so re-runs don't pile up.
  for (const c of CHECKINS) {
    const profile = volunteers[c.profileEmail]?.profile;
    if (!profile) continue;
    const bird = c.birdName ? birds[c.birdName] : null;
    const createdAt = minsAgo(c.minAgo);
    // Use createdAt millisecond as natural-ish key — re-run idempotency.
    const existing = await prisma.fosterCheckIn.findFirst({
      where: { profileId: profile.id, birdId: bird?.id ?? null, createdAt },
    });
    if (existing) {
      console.log(`existing ${c.profileEmail.padEnd(28)} ${c.pulse}  ${c.note.slice(0, 50)}`);
      continue;
    }
    await prisma.fosterCheckIn.create({
      data: {
        profileId: profile.id,
        birdId: bird?.id ?? null,
        pulse: c.pulse,
        note: c.note || null,
        createdAt,
      },
    });
    console.log(`created  ${c.profileEmail.padEnd(28)} ${c.pulse}  ${c.note.slice(0, 50)}`);
  }
}

// =====================================================================
// 5. Daily updates with high stress — also feeds concerns.
// =====================================================================

const DAILY_UPDATES = [
  {
    birdName: 'Marbles', fosterEmail: 'priya@example.com',
    stressLevel: 8, healthStatus: 'declining',
    concerns: 'Wing fracture site looks more swollen today. Bird is favoring it more than yesterday.',
    notes: 'Force-feeding required this morning.',
    minAgo: 60 * 4,
  },
  {
    birdName: 'Olive', fosterEmail: 'priya@example.com',
    stressLevel: 4, healthStatus: 'stable',
    concerns: '',
    notes: 'SQ fluids 20ml. Oral meds tolerated.',
    minAgo: 60 * 8,
  },
];

async function seedDailyUpdates(volunteers, birds) {
  console.log('\n=== Daily updates ===');
  for (const u of DAILY_UPDATES) {
    const bird = birds[u.birdName];
    const foster = volunteers[u.fosterEmail]?.foster;
    if (!bird || !foster) continue;
    const createdAt = minsAgo(u.minAgo);
    const existing = await prisma.dailyUpdate.findFirst({
      where: { birdId: bird.id, fosterId: foster.id, createdAt },
    });
    if (existing) continue;
    await prisma.dailyUpdate.create({
      data: {
        birdId: bird.id,
        fosterId: foster.id,
        stressLevel: u.stressLevel,
        healthStatus: u.healthStatus,
        concerns: u.concerns || null,
        notes: u.notes || null,
        createdAt,
      },
    });
    console.log(`created  ${u.birdName.padEnd(10)} stress=${u.stressLevel} health=${u.healthStatus}`);
  }
}

// =====================================================================
// 6. Volunteer events — points history so service-record isn't empty.
// =====================================================================

const POINT_HISTORY = [
  { email: 'theo@example.com',  kind: 'rescue.claim_point_person', pointDelta: 3,  refDesc: 'claimed dove rescue (Maya backyard)',         minAgo: 8 },
  { email: 'aria@example.com',  kind: 'rescue.resolved_rescued',    pointDelta: 10, refDesc: 'rescued stunned pigeon (Sandy & 39th)',       minAgo: 210 },
  { email: 'aria@example.com',  kind: 'rescue.resolved_escaped',    pointDelta: 3,  refDesc: 'crow escape attempt (Forest Park)',           minAgo: 1380 },
  { email: 'theo@example.com',  kind: 'rescue.resolved_deceased',   pointDelta: 5,  refDesc: 'deceased intake (Alberta St)',                minAgo: 540 },
  { email: 'devon@example.com', kind: 'rescue.unable_passed',       pointDelta: 1,  refDesc: 'passed fishing-line rescue (needs climbing)', minAgo: 85 },
  { email: 'devon@example.com', kind: 'rescue.unable_high_effort',  pointDelta: 2,  refDesc: 'pending review',                              minAgo: 85, approvalStatus: 'pending' },
  { email: 'maya@example.com',  kind: 'foster.check_in',            pointDelta: 1,  refDesc: 'daily check-in',                              minAgo: 60 },
  { email: 'priya@example.com', kind: 'foster.check_in_concern',    pointDelta: 1,  refDesc: 'concern flagged on Marbles',                  minAgo: 30 },
  { email: 'sam@example.com',   kind: 'foster.daily_update',        pointDelta: 2,  refDesc: 'Coco weight log',                             minAgo: 60 * 12 },
  { email: 'aria@example.com',  kind: 'rescue.emergency_response',  pointDelta: 5,  refDesc: 'after-hours response',                        minAgo: 720 },
];

async function seedPointHistory(volunteers) {
  console.log('\n=== Volunteer point events ===');
  for (const ev of POINT_HISTORY) {
    const profile = volunteers[ev.email]?.profile;
    if (!profile) continue;
    const createdAt = minsAgo(ev.minAgo);
    // Idempotency via (profile, kind, createdAt) — re-run safe.
    const existing = await prisma.volunteerEvent.findFirst({
      where: { profileId: profile.id, kind: ev.kind, createdAt },
    });
    if (existing) continue;
    await prisma.volunteerEvent.create({
      data: {
        profileId: profile.id,
        category: ev.kind.split('.')[0],
        kind: ev.kind,
        pointDelta: ev.pointDelta,
        approvalStatus: ev.approvalStatus ?? 'auto',
        notes: ev.refDesc,
        createdAt,
      },
    });
    console.log(`created  ${ev.email.padEnd(28)} ${ev.kind.padEnd(34)} ${ev.pointDelta > 0 ? '+' : ''}${ev.pointDelta} pts`);
  }
}

// =====================================================================
// 7. Transport requests — a few in different states.
// =====================================================================

const TRANSPORTS = [
  {
    title: 'Pip → Avian vet appointment',
    type: 'vet',
    fromAddress: '4521 NE 28th Ave, Portland, OR',
    toAddress: 'Avian Medical Center, 9745 SW Beaverton-Hillsdale Hwy',
    description: 'Pip needs foot-wrap change and X-ray follow-up. Carrier provided.',
    urgency: 'normal',
    status: 'open',
    pickupByHoursFromNow: 18,
    deliverByHoursFromNow: 19,
    birdName: 'Pip',
  },
  {
    title: 'Olive → vet recheck',
    type: 'vet',
    fromAddress: '6204 SE Foster Rd',
    toAddress: 'Bird & Exotic Hospital, 4520 SE Belmont',
    description: 'Recheck for wound healing. Calm bird, very portable.',
    urgency: 'high',
    status: 'assigned',
    volunteerEmail: 'marcus@example.com',
    pointPersonEmail: 'marcus@example.com',
    pointPersonClaimedMinAgo: 30,
    pickupByHoursFromNow: 2,
    deliverByHoursFromNow: 3,
    birdName: 'Olive',
  },
  {
    title: 'Pickup donations — Wild Birds Unlimited',
    type: 'supply',
    fromAddress: 'Wild Birds Unlimited, Beaverton',
    toAddress: 'CPR HQ',
    description: 'Donated supplies + food bags to pick up. Roughly 4 bags.',
    urgency: 'low',
    status: 'in_transit',
    volunteerEmail: 'leila@example.com',
    pointPersonEmail: 'leila@example.com',
    pointPersonClaimedMinAgo: 90,
    pickupByHoursFromNow: -1,  // already past
    deliverByHoursFromNow: 1,
  },
  {
    title: 'Marbles → vet (completed)',
    type: 'vet',
    fromAddress: '6204 SE Foster Rd',
    toAddress: 'Avian Medical Center, 9745 SW Beaverton-Hillsdale Hwy',
    description: 'Initial assessment.',
    urgency: 'normal',
    status: 'delivered',
    volunteerEmail: 'sam@example.com',
    pointPersonEmail: 'sam@example.com',
    pointPersonClaimedMinAgo: 60 * 24 * 2,
    resolvedMinAgo: 60 * 24 * 2 - 90,
    pickupByHoursFromNow: -48,
    deliverByHoursFromNow: -47,
    birdName: 'Marbles',
  },
];

async function seedTransports(volunteers, birds) {
  console.log('\n=== Transport requests ===');
  for (const t of TRANSPORTS) {
    const existing = await prisma.transportRequest.findFirst({
      where: { title: t.title },
    });
    const transport = t.volunteerEmail ? volunteers[t.volunteerEmail]?.transport : null;
    const pp = t.pointPersonEmail ? volunteers[t.pointPersonEmail]?.profile : null;
    const bird = t.birdName ? birds[t.birdName] : null;
    const data = {
      title: t.title,
      type: t.type,
      fromAddress: t.fromAddress,
      toAddress: t.toAddress,
      description: t.description,
      urgency: t.urgency,
      status: t.status,
      birdId: bird?.id ?? null,
      volunteerId: transport?.id ?? null,
      pointPersonId: pp?.id ?? null,
      pointPersonClaimedAt: t.pointPersonClaimedMinAgo ? minsAgo(t.pointPersonClaimedMinAgo) : null,
      resolvedAt: t.resolvedMinAgo ? minsAgo(t.resolvedMinAgo) : null,
      pickupBy: new Date(now.getTime() + t.pickupByHoursFromNow * 60 * 60 * 1000),
      deliverBy: new Date(now.getTime() + t.deliverByHoursFromNow * 60 * 60 * 1000),
    };
    if (existing) {
      await prisma.transportRequest.update({ where: { id: existing.id }, data });
      console.log(`updated  ${t.title.slice(0, 50).padEnd(50)} ${t.status}`);
    } else {
      await prisma.transportRequest.create({ data });
      console.log(`created  ${t.title.slice(0, 50).padEnd(50)} ${t.status}`);
    }
  }
}

// =====================================================================
// 8. Open assignments + standby — so the "follower" UX is exercised.
// =====================================================================

async function seedAssignmentsAndStandby(volunteers, rescues) {
  console.log('\n=== Assignments + standby ===');
  // Find the two active cases that we want to surface in volunteer feeds.
  const dovaCase = rescues.find(r => r.birdDescription === 'juvenile dove');
  const whitePigeonCase = rescues.find(r => r.birdDescription === 'white pigeon, fancy breed');
  const fishingLineCase = rescues.find(r => r.birdDescription === 'pigeon, fishing-line tangled foot');
  const trappedCase = rescues.find(r => r.birdDescription === 'pigeon trapped in netting');

  const pagedSet = [
    // Dove case: Theo is PP (claimed), Sam + Aria paged
    { caseId: dovaCase?.id, emails: ['theo@example.com', 'sam@example.com', 'aria@example.com', 'devon@example.com'], ppEmail: 'theo@example.com' },
    // White pigeon: Devon is PP but silent — Sam + Aria paged, Sam on standby
    { caseId: whitePigeonCase?.id, emails: ['devon@example.com', 'sam@example.com', 'aria@example.com'], ppEmail: 'devon@example.com', standbyEmails: ['sam@example.com'] },
    // Fishing-line case escalated: nobody is PP, several paged including coordinators
    { caseId: fishingLineCase?.id, emails: ['aria@example.com', 'sam@example.com', 'christina@cascadiapigeonrescue.org'], ppEmail: null },
    // Emergency trapped: open call, every rescuer paged
    { caseId: trappedCase?.id, emails: ['theo@example.com', 'devon@example.com', 'aria@example.com', 'sam@example.com', 'christina@cascadiapigeonrescue.org'], ppEmail: null, emergencyBroadcast: true },
  ];

  for (const group of pagedSet) {
    if (!group.caseId) continue;
    for (const email of group.emails) {
      const profile = volunteers[email]?.profile;
      if (!profile) continue;
      const isPp = email === group.ppEmail;
      const isStandby = group.standbyEmails?.includes(email);
      const status = isPp ? 'claimed' : 'notified';
      await prisma.assignment.upsert({
        where: { jobType_jobId_profileId: { jobType: 'RescueCase', jobId: group.caseId, profileId: profile.id } },
        update: {
          status,
          claimedAt: isPp ? minsAgo(10) : null,
          standbyAt: isStandby ? minsAgo(20) : null,
        },
        create: {
          jobType: 'RescueCase',
          jobId: group.caseId,
          profileId: profile.id,
          status,
          claimedAt: isPp ? minsAgo(10) : null,
          standbyAt: isStandby ? minsAgo(20) : null,
          source: group.emergencyBroadcast ? 'emergency_broadcast' : 'shift_overlap',
        },
      });
    }
  }
  console.log('seeded assignment rows for 4 active cases');
}

// =====================================================================
// Run.
// =====================================================================

async function main() {
  // Need the seed-volunteer-portal seeds (christina/maya/theo/sam) to exist
  // as PROFILES first, since some of our event/checkin seeds reference them.
  // Easiest: also load them from the original seed file's email list.
  const baseEmails = ['christina@cascadiapigeonrescue.org', 'maya@example.com', 'theo@example.com', 'sam@example.com'];
  const baseProfiles = {};
  for (const email of baseEmails) {
    const profile = await prisma.volunteerProfile.findUnique({ where: { email } });
    if (profile) {
      const foster = profile.fosterId ? await prisma.foster.findUnique({ where: { id: profile.fosterId } }) : null;
      const transport = profile.transportId ? await prisma.transportVolunteer.findUnique({ where: { id: profile.transportId } }) : null;
      const rescue = profile.rescueId ? await prisma.rescueVolunteer.findUnique({ where: { id: profile.rescueId } }) : null;
      baseProfiles[email] = { profile, foster, transport, rescue };
    }
  }

  const newProfiles = await seedVolunteers();
  const allProfiles = { ...baseProfiles, ...newProfiles };

  const birds = await seedBirds(allProfiles);
  const rescues = await seedRescueCases(allProfiles, birds);
  await seedCheckIns(allProfiles, birds);
  await seedDailyUpdates(allProfiles, birds);
  await seedPointHistory(allProfiles);
  await seedTransports(allProfiles, birds);
  await seedAssignmentsAndStandby(allProfiles, rescues);

  console.log('\n✅ Rich dummy seed complete.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
