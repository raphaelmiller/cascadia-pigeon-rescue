import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

const day = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function reset() {
  // Order matters because of FKs.
  await prisma.dailyUpdate.deleteMany();
  await prisma.wellnessLog.deleteMany();
  await prisma.request.deleteMany();
  await prisma.caseNote.deleteMany();
  await prisma.vetVisit.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.bandageTask.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.placement.deleteMany();
  await prisma.bird.deleteMany();
  await prisma.foster.deleteMany();
  await prisma.transportRequest.deleteMany();
  await prisma.transportVolunteer.deleteMany();
  await prisma.rescueShift.deleteMany();
  await prisma.rescueVolunteer.deleteMany();
  await prisma.supply.deleteMany();
}

async function main() {
  await reset();

  // Fosters
  const maya = await prisma.foster.create({
    data: {
      name: 'Maya R.',
      phone: '206-555-0101',
      email: 'maya@example.org',
      address: 'Ballard, Seattle',
      hasTransport: true,
      capacity: 4,
      quarantineAble: true,
      medicalSkill: 'advanced',
      tubeFeedingSkill: true,
      woundCareSkill: true,
      neonateSkill: true,
      longTermAble: true,
      preferredTypes: 'medical, neonates',
      availability: 'available',
      currentStress: 8,
      whiteboardNote: 'Need pellets ASAP. Ada bandage change Tuesday.',
      notes: 'Long-time CPR foster. Comfortable with crop-feeding and SQ fluids.',
    },
  });
  const sam = await prisma.foster.create({
    data: {
      name: 'Sam T.',
      phone: '206-555-0102',
      email: 'sam@example.org',
      address: 'Capitol Hill, Seattle',
      hasTransport: false,
      capacity: 2,
      medicalSkill: 'basic',
      currentStress: 3,
      preferredTypes: 'feral juveniles',
      availability: 'available',
    },
  });
  const jordan = await prisma.foster.create({
    data: {
      name: 'Jordan P.',
      phone: '206-555-0103',
      address: 'West Seattle',
      hasTransport: true,
      capacity: 3,
      medicalSkill: 'intermediate',
      tubeFeedingSkill: true,
      currentStress: 5,
      whiteboardNote: 'Can take 1 more bird this week.',
    },
  });
  const lee = await prisma.foster.create({
    data: {
      name: 'Lee K.',
      phone: '206-555-0104',
      address: 'Tacoma',
      capacity: 6,
      longTermAble: true,
      medicalSkill: 'basic',
      currentStress: 1,
      availability: 'limited',
    },
  });
  const priya = await prisma.foster.create({
    data: {
      name: 'Priya V.',
      capacity: 3,
      medicalSkill: 'advanced',
      tubeFeedingSkill: true,
      woundCareSkill: true,
      currentStress: 9,
      whiteboardNote: '🚨 Need rehome for 1 bird — burnout warning.',
      address: 'Bellevue',
    },
  });

  // Birds
  const ada = await prisma.bird.create({
    data: {
      name: 'Ada',
      species: 'rock pigeon',
      age: 'adult',
      sex: 'F',
      weightGrams: 312,
      bandInfo: 'silver, no number',
      foundLocation: '5th & Pike, downtown Seattle',
      finderName: 'Ms. Chen (good samaritan)',
      finderContact: '206-555-2200',
      status: 'medical_hold',
      medicalPriority: 'high',
      primaryDiagnosis: 'open wing fracture, suspected raptor strike',
      contagionRisk: 'low',
      feedingStatus: 'self',
      heatSupport: false,
      medicalNotes: 'External fixator placed Wed. Reassess flight feathers in 2 wks.',
      dietNotes: 'pellets + seed mix; supplement greens',
      fosterId: maya.id,
    },
  });
  const drum = await prisma.bird.create({
    data: {
      name: 'Drum',
      species: 'rock pigeon',
      age: 'juvenile',
      sex: 'M',
      weightGrams: 245,
      foundLocation: 'Pioneer Square parking garage',
      status: 'in_foster',
      medicalPriority: 'low',
      primaryDiagnosis: 'mild canker (treated)',
      fosterId: sam.id,
    },
  });
  const luna = await prisma.bird.create({
    data: {
      name: 'Luna',
      species: 'feral pigeon',
      age: 'hatchling',
      foundLocation: 'roof, 3rd Ave',
      status: 'quarantine',
      medicalPriority: 'medium',
      feedingStatus: 'tube',
      heatSupport: true,
      medicalNotes: 'Day-old when found. Crop feeding 5x/day.',
      fosterId: priya.id,
    },
  });
  const rocky = await prisma.bird.create({
    data: {
      name: 'Rocky',
      species: 'pigeon',
      age: 'adult',
      sex: 'M',
      foundLocation: 'Lake Union dock',
      status: 'needs_foster',
      medicalPriority: 'medium',
      primaryDiagnosis: 'lead toxicity, mild',
    },
  });
  const sage = await prisma.bird.create({
    data: {
      name: 'Sage',
      species: 'mourning dove',
      age: 'juvenile',
      foundLocation: 'cat-attack, Ballard',
      status: 'needs_intake',
      medicalPriority: 'high',
      primaryDiagnosis: 'puncture wounds, possible internal injury',
    },
  });
  const otis = await prisma.bird.create({
    data: {
      name: 'Otis',
      species: 'rock pigeon',
      age: 'adult',
      status: 'adoption_ready',
      medicalPriority: 'none',
      fosterId: jordan.id,
    },
  });
  const kiwi = await prisma.bird.create({
    data: {
      name: 'Kiwi',
      species: 'pigeon',
      age: 'adult',
      sex: 'F',
      status: 'long_term_foster',
      medicalPriority: 'low',
      fosterId: lee.id,
      medicalNotes: 'Splay-leg, non-releasable. Permanent companion bird.',
    },
  });
  const moss = await prisma.bird.create({
    data: {
      name: 'Moss',
      species: 'rock pigeon',
      age: 'adult',
      status: 'needs_transfer',
      medicalPriority: 'medium',
      primaryDiagnosis: 'recovering, needs transfer to long-term foster',
      fosterId: priya.id,
    },
  });

  // Placements
  await prisma.placement.create({ data: { birdId: ada.id, fosterId: maya.id, startDate: day(-12), reason: 'medical', status: 'active' } });
  await prisma.placement.create({ data: { birdId: drum.id, fosterId: sam.id, startDate: day(-8), reason: 'initial', status: 'active' } });
  await prisma.placement.create({ data: { birdId: luna.id, fosterId: priya.id, startDate: day(-4), reason: 'neonate', status: 'active' } });
  await prisma.placement.create({ data: { birdId: otis.id, fosterId: jordan.id, startDate: day(-30), reason: 'initial', status: 'active' } });
  await prisma.placement.create({ data: { birdId: kiwi.id, fosterId: lee.id, startDate: day(-180), reason: 'long_term', status: 'active' } });
  await prisma.placement.create({ data: { birdId: moss.id, fosterId: priya.id, startDate: day(-15), reason: 'medical', status: 'active' } });

  // Medications
  await prisma.medication.create({
    data: {
      birdId: ada.id, name: 'Meloxicam', dose: '0.1 mg/kg', concentration: '1.5 mg/mL', route: 'PO',
      frequency: 'BID', startDate: day(-7), daysSupplied: 10, expectedRunOut: day(3),
      reassessDate: day(7), notes: 'pain control post-surgery',
    },
  });
  await prisma.medication.create({
    data: {
      birdId: ada.id, name: 'Enrofloxacin', dose: '15 mg/kg', route: 'PO', frequency: 'BID',
      startDate: day(-7), daysSupplied: 14, expectedRunOut: day(7),
      notes: 'prophylactic abx',
    },
  });
  await prisma.medication.create({
    data: {
      birdId: drum.id, name: 'Metronidazole', dose: '50 mg/kg', route: 'PO', frequency: 'SID',
      startDate: day(-5), daysSupplied: 10, expectedRunOut: day(5),
    },
  });
  await prisma.medication.create({
    data: {
      birdId: rocky.id, name: 'Calcium EDTA', dose: '35 mg/kg', route: 'IM', frequency: 'BID',
      startDate: day(-2), daysSupplied: 5, expectedRunOut: day(3), reassessDate: day(5),
      notes: 'lead chelation course; recheck blood lead in 5 days',
    },
  });
  await prisma.medication.create({
    data: {
      birdId: luna.id, name: 'Nystatin', dose: '0.05 mL', route: 'PO', frequency: 'TID',
      startDate: day(-1), daysSupplied: 7, expectedRunOut: day(6),
      notes: 'crop yeast prophylaxis',
    },
  });

  // Calendar
  await prisma.calendarEvent.create({ data: { title: 'Ada — bandage change', type: 'bandage', startsAt: day(1), birdId: ada.id, notes: 'remove vet wrap, photograph wound' } });
  await prisma.calendarEvent.create({ data: { title: 'Rocky — vet recheck (lead level)', type: 'vet', startsAt: day(5), birdId: rocky.id } });
  await prisma.calendarEvent.create({ data: { title: 'Luna — fledge milestone check', type: 'followup', startsAt: day(7), birdId: luna.id } });
  await prisma.calendarEvent.create({ data: { title: 'Pellet supply order', type: 'supply', startsAt: day(2) } });
  await prisma.calendarEvent.create({ data: { title: 'Moss — transfer to Lee K.', type: 'transfer', startsAt: day(3), birdId: moss.id } });
  await prisma.calendarEvent.create({ data: { title: 'Otis — adoption meet-greet', type: 'adoption', startsAt: day(4), birdId: otis.id } });

  // Requests
  await prisma.request.create({
    data: {
      fosterId: priya.id, birdId: moss.id, type: 'transport', urgency: 'urgent',
      description: 'Need Moss transferred this week — at capacity, neonate Luna needs full attention.',
      status: 'open',
    },
  });
  await prisma.request.create({
    data: {
      fosterId: maya.id, type: 'supply', urgency: 'high',
      description: 'Out of medical-grade pellets. Need 5 lb by Thursday.',
      status: 'open',
    },
  });
  await prisma.request.create({
    data: {
      fosterId: jordan.id, birdId: otis.id, type: 'vet', urgency: 'normal',
      description: 'Otis ready for adoption health certificate. Schedule with Dr. Rivera.',
      status: 'in_progress',
    },
  });

  // Wellness logs
  for (const f of [maya, sam, jordan, lee, priya]) {
    for (let i = 0; i < 5; i++) {
      const baseStress = f.currentStress;
      const wob = Math.max(1, Math.min(10, baseStress + (Math.random() < 0.5 ? -1 : 1)));
      await prisma.wellnessLog.create({
        data: {
          fosterId: f.id,
          stressLevel: i === 0 ? f.currentStress : wob,
          burnoutWarning: f.currentStress >= 9 && i === 0,
          needsRehome: f.currentStress >= 8 && i === 0,
          createdAt: day(-i),
        },
      });
    }
  }

  // Daily updates
  await prisma.dailyUpdate.create({
    data: {
      birdId: ada.id, fosterId: maya.id,
      healthStatus: 'bright, eating well',
      eatingDrinking: 'self-feeding pellets, drinking',
      poopQuality: 'normal',
      energyLevel: 'alert',
      medsAdministered: 'Meloxicam AM ✓ · Enro AM ✓',
      stressLevel: 8,
      concerns: 'Wing wrap loosening, will redo before bandage change appt.',
    },
  });
  await prisma.dailyUpdate.create({
    data: {
      birdId: drum.id, fosterId: sam.id,
      healthStatus: 'bright',
      eatingDrinking: 'self',
      poopQuality: 'normal',
      energyLevel: 'alert',
      stressLevel: 3,
    },
  });
  await prisma.dailyUpdate.create({
    data: {
      birdId: luna.id, fosterId: priya.id,
      healthStatus: 'gaining weight (+12g overnight)',
      eatingDrinking: 'crop-fed q3h',
      poopQuality: 'normal nestling',
      energyLevel: 'alert, vocalizing',
      stressLevel: 9,
      concerns: 'I am at my limit — need Moss moved this week.',
    },
  });

  // Case notes
  await prisma.caseNote.create({ data: { birdId: ada.id, author: 'Dr. Rivera', body: 'External fixator placement successful. Recheck flight feathers at 2 weeks.' } });
  await prisma.caseNote.create({ data: { birdId: ada.id, author: 'Maya', body: 'Eating well, no signs of pain. Bandage clean.' } });
  await prisma.caseNote.create({ data: { birdId: rocky.id, body: 'Blood lead level 38 µg/dL on intake — moderate. Started chelation.' } });

  // ====================================================================
  // PHASE 2 SEED
  // ====================================================================

  // Transport volunteers
  const driver1 = await prisma.transportVolunteer.create({
    data: {
      name: 'Wei H.',
      phone: '206-555-0301',
      location: 'Greenwood',
      vehicleType: 'SUV',
      maxDistanceMi: 40,
      medicalCapable: true,
      availability: 'weekends + Tue/Thu evenings',
      notes: 'Has a kennel in the back. Comfortable with crop-fed birds.',
    },
  });
  const driver2 = await prisma.transportVolunteer.create({
    data: {
      name: 'Bea S.',
      phone: '206-555-0302',
      location: 'Renton',
      vehicleType: 'sedan',
      maxDistanceMi: 25,
      availability: 'weekday afternoons',
    },
  });
  await prisma.transportVolunteer.create({
    data: {
      name: 'Marcus L.',
      phone: '253-555-0303',
      location: 'Tacoma',
      vehicleType: 'pickup',
      maxDistanceMi: 80,
      medicalCapable: true,
      availability: 'flexible',
      notes: 'Long-haul OK. Will handle south-sound transports.',
    },
  });

  // Transport requests
  await prisma.transportRequest.create({
    data: {
      fromAddress: 'Priya V. (Bellevue)',
      toAddress: 'Lee K. (Tacoma)',
      pickupBy: day(2),
      deliverBy: day(2),
      description: 'Moss — transfer to long-term foster.',
      urgency: 'urgent',
      status: 'open',
      birdId: moss.id,
    },
  });
  await prisma.transportRequest.create({
    data: {
      fromAddress: 'CPR storage (Ballard)',
      toAddress: 'Maya R. (Ballard)',
      pickupBy: day(1),
      description: '5 lb medical-grade pellets + heating pad.',
      urgency: 'high',
      status: 'assigned',
      volunteerId: driver1.id,
    },
  });
  await prisma.transportRequest.create({
    data: {
      fromAddress: 'Dr. Rivera vet clinic (Lynnwood)',
      toAddress: 'Maya R. (Ballard)',
      pickupBy: day(0.25),
      description: 'Ada — post-op pickup.',
      urgency: 'normal',
      status: 'in_transit',
      volunteerId: driver2.id,
      birdId: ada.id,
    },
  });

  // Rescue volunteers
  const r1 = await prisma.rescueVolunteer.create({
    data: {
      name: 'Diego M.',
      phone: '206-555-0401',
      location: 'Capitol Hill',
      skills: 'climbing, netting, first-aid',
      emergencyResponse: true,
      availability: 'weekends, evenings on-call',
    },
  });
  const r2 = await prisma.rescueVolunteer.create({
    data: {
      name: 'Aiko N.',
      phone: '206-555-0402',
      location: 'Wallingford',
      skills: 'driver, first-aid, comfortable on roofs',
      availability: 'weekdays after 5pm',
    },
  });
  await prisma.rescueVolunteer.create({
    data: {
      name: 'Owen T.',
      phone: '425-555-0403',
      location: 'Bellevue',
      skills: 'driver, calm-handling',
      availability: 'weekend mornings',
    },
  });

  // Rescue shifts
  await prisma.rescueShift.create({
    data: {
      startsAt: day(0.1), endsAt: day(0.4),
      shiftType: 'on_call', area: 'Seattle north',
      volunteerId: r1.id,
    },
  });
  await prisma.rescueShift.create({
    data: {
      startsAt: day(0.5), endsAt: day(1),
      shiftType: 'on_call', area: 'Seattle south',
    }, // unassigned
  });
  await prisma.rescueShift.create({
    data: {
      startsAt: day(1), endsAt: day(1.5),
      shiftType: 'active', area: 'Eastside',
      volunteerId: r2.id,
    },
  });
  await prisma.rescueShift.create({
    data: {
      startsAt: day(2), endsAt: day(2.5),
      shiftType: 'emergency_backup', area: 'all',
    }, // unassigned
  });
  await prisma.rescueShift.create({
    data: {
      startsAt: day(3), endsAt: day(3.4),
      shiftType: 'on_call', area: 'Seattle north',
      volunteerId: r1.id,
    },
  });

  // Supplies
  await prisma.supply.create({ data: { name: 'Medical-grade pellets', category: 'food', unit: 'lb', onHand: 1, threshold: 5, reorderUrl: 'https://example.com/pellets', notes: 'Roudybush daily maintenance.' } });
  await prisma.supply.create({ data: { name: 'Kaytee exact hand-feeding formula', category: 'food', unit: 'lb', onHand: 8, threshold: 4 } });
  await prisma.supply.create({ data: { name: 'Vet wrap', category: 'medical', unit: 'rolls', onHand: 0, threshold: 6 } });
  await prisma.supply.create({ data: { name: 'Gauze pads (4x4)', category: 'medical', unit: 'box', onHand: 3, threshold: 2 } });
  await prisma.supply.create({ data: { name: '60 mL crop syringes', category: 'medical', unit: 'each', onHand: 12, threshold: 6 } });
  await prisma.supply.create({ data: { name: 'Heating pads', category: 'housing', unit: 'each', onHand: 2, threshold: 4 } });
  await prisma.supply.create({ data: { name: 'Travel kennels (small)', category: 'housing', unit: 'each', onHand: 6, threshold: 3 } });
  await prisma.supply.create({ data: { name: 'F10 disinfectant', category: 'cleaning', unit: 'mL', onHand: 250, threshold: 500 } });
  await prisma.supply.create({ data: { name: 'Newspaper', category: 'cleaning', unit: 'stack', onHand: 4, threshold: 2 } });
  await prisma.supply.create({ data: { name: 'Intake forms', category: 'paperwork', unit: 'each', onHand: 18, threshold: 10 } });

  // Bandage tasks
  await prisma.bandageTask.create({
    data: {
      birdId: ada.id,
      description: 'Wing wrap change — figure-8 with vet wrap',
      intervalDays: 2,
      nextDueAt: day(1),
      lastDoneAt: day(-1),
      notes: 'Photograph wound. Watch for swelling at fixator pin sites.',
    },
  });
  await prisma.bandageTask.create({
    data: {
      birdId: sage.id,
      description: 'Puncture-wound dressing change',
      intervalDays: 1,
      nextDueAt: day(0.2),
      notes: 'Clean with saline, apply silver sulfadiazine, gauze + vet wrap.',
    },
  });
  await prisma.bandageTask.create({
    data: {
      birdId: moss.id,
      description: 'Foot bandage check',
      intervalDays: 3,
      nextDueAt: day(2),
      lastDoneAt: day(-1),
    },
  });

  console.log('✅ Seeded:', {
    fosters: 5, birds: 8, placements: 6, meds: 5, events: 6, requests: 3,
    transportVolunteers: 3, transportRequests: 3,
    rescueVolunteers: 3, rescueShifts: 5,
    supplies: 10, bandageTasks: 3,
  });
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
