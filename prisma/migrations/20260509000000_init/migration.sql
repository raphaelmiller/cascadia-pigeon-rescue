
-- CreateTable
CREATE TABLE "Bird" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "age" TEXT,
    "sex" TEXT,
    "weightGrams" REAL,
    "bandInfo" TEXT,
    "intakeDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foundLocation" TEXT,
    "finderName" TEXT,
    "finderContact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_intake',
    "placementNeed" TEXT,
    "medicalPriority" TEXT NOT NULL DEFAULT 'none',
    "dietNotes" TEXT,
    "behaviorNotes" TEXT,
    "specialHandling" TEXT,
    "outcome" TEXT,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "primaryDiagnosis" TEXT,
    "contagionRisk" TEXT,
    "feedingStatus" TEXT,
    "heatSupport" BOOLEAN NOT NULL DEFAULT false,
    "medicalNotes" TEXT,
    "fosterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bird_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Foster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "photoUrl" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "medicalSkill" TEXT NOT NULL DEFAULT 'beginner',
    "longTermAble" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "canTransportSelf" BOOLEAN NOT NULL DEFAULT false,
    "skillEnrichment" BOOLEAN NOT NULL DEFAULT false,
    "skillOralMeds" BOOLEAN NOT NULL DEFAULT false,
    "skillSyringeFeed" BOOLEAN NOT NULL DEFAULT false,
    "skillTubeFeed" BOOLEAN NOT NULL DEFAULT false,
    "skillQuarantine" BOOLEAN NOT NULL DEFAULT false,
    "skillWoundCare" BOOLEAN NOT NULL DEFAULT false,
    "skillNeonates" BOOLEAN NOT NULL DEFAULT false,
    "skillFootBandages" BOOLEAN NOT NULL DEFAULT false,
    "skillBoots" BOOLEAN NOT NULL DEFAULT false,
    "skillWingWraps" BOOLEAN NOT NULL DEFAULT false,
    "skillSubqFluids" BOOLEAN NOT NULL DEFAULT false,
    "skillIMInjections" BOOLEAN NOT NULL DEFAULT false,
    "skillCompoundMeds" BOOLEAN NOT NULL DEFAULT false,
    "skillCropSwabsFecals" BOOLEAN NOT NULL DEFAULT false,
    "skillCropFlushes" BOOLEAN NOT NULL DEFAULT false,
    "skillCageTime" BOOLEAN NOT NULL DEFAULT false,
    "skillBirdLights" BOOLEAN NOT NULL DEFAULT false,
    "skillSupplements" BOOLEAN NOT NULL DEFAULT false,
    "skillMedKnowledge" BOOLEAN NOT NULL DEFAULT false,
    "skillEmaciationCare" BOOLEAN NOT NULL DEFAULT false,
    "whiteboardNote" TEXT,
    "currentStress" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "fosterId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "reason" TEXT,
    "transferReason" TEXT,
    "transportDetails" TEXT,
    "suppliesSent" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Placement_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Placement_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "concentration" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopDate" DATETIME,
    "reassessDate" DATETIME,
    "amountDispensed" REAL,
    "daysSupplied" INTEGER,
    "expectedRunOut" DATETIME,
    "refillPrepared" BOOLEAN NOT NULL DEFAULT false,
    "refillDelivered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Medication_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WellnessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fosterId" TEXT NOT NULL,
    "stressLevel" INTEGER NOT NULL,
    "capacityConfidence" INTEGER,
    "needsRehome" BOOLEAN NOT NULL DEFAULT false,
    "needsSupplies" BOOLEAN NOT NULL DEFAULT false,
    "needsLeadership" BOOLEAN NOT NULL DEFAULT false,
    "burnoutWarning" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WellnessLog_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fosterId" TEXT NOT NULL,
    "birdId" TEXT,
    "type" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Request_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "fosterId" TEXT NOT NULL,
    "healthStatus" TEXT,
    "eatingDrinking" TEXT,
    "poopQuality" TEXT,
    "energyLevel" TEXT,
    "medsAdministered" TEXT,
    "stressLevel" INTEGER,
    "concerns" TEXT,
    "whiteboardUpdate" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyUpdate_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyUpdate_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isProfile" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Photo_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyUpdatePhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyUpdateId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyUpdatePhoto_dailyUpdateId_fkey" FOREIGN KEY ("dailyUpdateId") REFERENCES "DailyUpdate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "author" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseNote_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "birdId" TEXT,
    "notes" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEvent_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VetVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "visitDate" DATETIME NOT NULL,
    "vetName" TEXT,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "followup" TEXT,
    "cost" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VetVisit_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportVolunteer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "vehicleType" TEXT,
    "maxDistanceMi" INTEGER,
    "medicalCapable" BOOLEAN NOT NULL DEFAULT false,
    "availability" TEXT,
    "notes" TEXT,
    "linkedFosterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportVolunteer_linkedFosterId_fkey" FOREIGN KEY ("linkedFosterId") REFERENCES "Foster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "pickupBy" DATETIME NOT NULL,
    "deliverBy" DATETIME,
    "description" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "volunteerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportRequest_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportRequest_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "TransportVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RescueVolunteer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "skills" TEXT,
    "emergencyResponse" BOOLEAN NOT NULL DEFAULT false,
    "availability" TEXT,
    "notes" TEXT,
    "linkedFosterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescueVolunteer_linkedFosterId_fkey" FOREIGN KEY ("linkedFosterId") REFERENCES "Foster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RescueShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "shiftType" TEXT NOT NULL DEFAULT 'on_call',
    "area" TEXT,
    "notes" TEXT,
    "volunteerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescueShift_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "RescueVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "onHand" REAL NOT NULL DEFAULT 0,
    "threshold" REAL NOT NULL DEFAULT 0,
    "reorderUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BandageTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 2,
    "nextDueAt" DATETIME NOT NULL,
    "lastDoneAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BandageTask_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportVolunteer_linkedFosterId_key" ON "TransportVolunteer"("linkedFosterId");

-- CreateIndex
CREATE UNIQUE INDEX "RescueVolunteer_linkedFosterId_key" ON "RescueVolunteer"("linkedFosterId");

