// Seed a few VolunteerProfile rows so the portal has something to log
// into without running the full destructive `db:seed` first.
//
// Idempotent: safe to run multiple times. For each volunteer:
//   1. Look up (or create) the per-role record (Foster, TransportVolunteer,
//      RescueVolunteer) on the legacy tables -- so the per-role data
//      (vehicle, skills, etc.) has somewhere to live.
//   2. Upsert the VolunteerProfile and wire the FK pointers.
//
// Without (1) the /profile page renders no sub-sections (QA H5). With it,
// Maya sees a Foster card with her capacity, Theo sees Transport + Rescue
// cards, Sam sees all three.

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

const SEEDS = [
  {
    email: 'christina@cascadiapigeonrescue.org',
    name: 'Christina',
    phone: process.env.CHRISTINA_PHONE || '+15035550100',
    roleTags: 'coordinator,lead_foster,med_admin,rescue_lead,vet_liaison,intake',
    isCoordinator: true,
  },
  {
    email: 'maya@example.com',
    name: 'Maya Rivers',
    phone: '+15035550101',
    roleTags: 'foster,med_admin',
    isCoordinator: false,
    foster: {
      capacity: 4,
      medicalSkill: 'intermediate',
      address: '4521 NE 28th Ave, Portland, OR 97211',
      longTermAble: false,
      skillOralMeds: true,
      skillSyringeFeed: true,
      skillQuarantine: true,
      skillSubqFluids: true,
    },
  },
  {
    email: 'theo@example.com',
    name: 'Theo Park',
    phone: '+15035550102',
    roleTags: 'transport,rescue',
    isCoordinator: false,
    transport: {
      vehicleType: 'SUV',
      maxDistanceMi: 60,
      location: 'NE Portland',
      medicalCapable: false,
    },
    rescue: {
      location: 'NE Portland',
      skills: 'Netting, ladder work, basic first-aid',
      emergencyResponse: true,
    },
  },
  {
    email: 'sam@example.com',
    name: 'Sam Hale',
    phone: '+15035550103',
    roleTags: 'foster,transport,rescue,coordinator,lead_foster',
    isCoordinator: true,
    foster: {
      capacity: 8,
      medicalSkill: 'advanced',
      address: '1830 SE Hawthorne Blvd, Portland, OR 97214',
      longTermAble: true,
      skillOralMeds: true,
      skillSyringeFeed: true,
      skillQuarantine: true,
      skillTubeFeed: true,
      skillCompoundMeds: true,
      skillWoundCare: true,
      skillFootBandages: true,
      skillBoots: true,
      skillSubqFluids: true,
      skillIMInjections: true,
      skillCropSwabsFecals: true,
      skillCropFlushes: true,
      skillNeonates: true,
      skillMedKnowledge: true,
      skillEmaciationCare: true,
      skillBirdLights: true,
      skillSupplements: true,
      skillCageTime: true,
      skillEnrichment: true,
    },
    transport: {
      vehicleType: 'Van',
      maxDistanceMi: 150,
      location: 'SE Portland',
      medicalCapable: true,
    },
    rescue: {
      location: 'SE Portland',
      skills: 'Lead rescuer. Climbing, netting, wing/leg restraint, triage.',
      emergencyResponse: true,
    },
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

async function main() {
  for (const s of SEEDS) {
    const [foster, transport, rescue] = await Promise.all([
      upsertFoster(s.email, s.name, s.phone, s.foster),
      upsertTransport(s.email, s.name, s.phone, s.transport),
      upsertRescue(s.email, s.name, s.phone, s.rescue),
    ]);
    const data = {
      email: s.email,
      name: s.name,
      phone: s.phone,
      roleTags: s.roleTags,
      isCoordinator: s.isCoordinator,
      invitedAt: new Date(),
      fosterId: foster?.id ?? null,
      transportId: transport?.id ?? null,
      rescueId: rescue?.id ?? null,
    };
    const existing = await prisma.volunteerProfile.findUnique({ where: { email: s.email } });
    if (existing) {
      await prisma.volunteerProfile.update({ where: { id: existing.id }, data });
      console.log(`updated  ${s.email}  foster=${!!foster} transport=${!!transport} rescue=${!!rescue}`);
    } else {
      await prisma.volunteerProfile.create({ data });
      console.log(`created  ${s.email}  foster=${!!foster} transport=${!!transport} rescue=${!!rescue}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
