/*
  Warnings:

  - You are about to alter the column `bornInCaptivity` on the `Bird` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `clearedForIntegration` on the `Bird` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `currentlyQuarantined` on the `Bird` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `ownerSurrender` on the `Bird` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `starred` on the `Bird` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.

*/
-- CreateTable
CREATE TABLE "VolunteerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "roleTags" TEXT NOT NULL DEFAULT '',
    "isCoordinator" BOOLEAN NOT NULL DEFAULT false,
    "fosterId" TEXT,
    "transportId" TEXT,
    "rescueId" TEXT,
    "invitedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VolunteerProfile_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VolunteerProfile_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "TransportVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VolunteerProfile_rescueId_fkey" FOREIGN KEY ("rescueId") REFERENCES "RescueVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VolunteerMagicLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "redirectTo" TEXT NOT NULL DEFAULT '/',
    "issuedIp" TEXT,
    "issuedUa" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolunteerMagicLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VolunteerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tag" TEXT,
    "dedupeKey" TEXT,
    "provider" TEXT NOT NULL,
    "providerSid" TEXT,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VolunteerEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pointDelta" INTEGER NOT NULL DEFAULT 0,
    "approvalStatus" TEXT NOT NULL DEFAULT 'auto',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "refType" TEXT,
    "refId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolunteerEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VolunteerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bird" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "age" TEXT,
    "sex" TEXT,
    "weightGrams" REAL,
    "bandInfo" TEXT,
    "intakeDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foundDateYear" INTEGER,
    "foundDateMonth" INTEGER,
    "foundDateDay" INTEGER,
    "foundLocation" TEXT,
    "finderName" TEXT,
    "finderContact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_intake',
    "placementNeed" TEXT,
    "medicalPriority" TEXT NOT NULL DEFAULT 'none',
    "currentlyQuarantined" BOOLEAN NOT NULL DEFAULT false,
    "clearedForIntegration" BOOLEAN NOT NULL DEFAULT false,
    "projectedClearedYear" INTEGER,
    "projectedClearedMonth" INTEGER,
    "projectedClearedDay" INTEGER,
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
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "bornInCaptivity" BOOLEAN NOT NULL DEFAULT false,
    "ownerSurrender" BOOLEAN NOT NULL DEFAULT false,
    "backstory" TEXT,
    "fosterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bird_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bird" ("age", "archivedAt", "backstory", "bandInfo", "behaviorNotes", "bornInCaptivity", "breed", "clearedForIntegration", "contagionRisk", "createdAt", "currentlyQuarantined", "deletedAt", "dietNotes", "feedingStatus", "finderContact", "finderName", "fosterId", "foundDateDay", "foundDateMonth", "foundDateYear", "foundLocation", "heatSupport", "id", "intakeDate", "medicalNotes", "medicalPriority", "name", "outcome", "ownerSurrender", "placementNeed", "primaryDiagnosis", "projectedClearedDay", "projectedClearedMonth", "projectedClearedYear", "sex", "specialHandling", "species", "starred", "status", "updatedAt", "weightGrams") SELECT "age", "archivedAt", "backstory", "bandInfo", "behaviorNotes", "bornInCaptivity", "breed", "clearedForIntegration", "contagionRisk", "createdAt", "currentlyQuarantined", "deletedAt", "dietNotes", "feedingStatus", "finderContact", "finderName", "fosterId", "foundDateDay", "foundDateMonth", "foundDateYear", "foundLocation", "heatSupport", "id", "intakeDate", "medicalNotes", "medicalPriority", "name", "outcome", "ownerSurrender", "placementNeed", "primaryDiagnosis", "projectedClearedDay", "projectedClearedMonth", "projectedClearedYear", "sex", "specialHandling", "species", "starred", "status", "updatedAt", "weightGrams" FROM "Bird";
DROP TABLE "Bird";
ALTER TABLE "new_Bird" RENAME TO "Bird";
CREATE TABLE "new_RescueAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volunteerId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "rrule" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescueAvailability_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "RescueVolunteer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RescueAvailability" ("createdAt", "endsAt", "id", "notes", "rrule", "startsAt", "updatedAt", "volunteerId") SELECT "createdAt", "endsAt", "id", "notes", "rrule", "startsAt", "updatedAt", "volunteerId" FROM "RescueAvailability";
DROP TABLE "RescueAvailability";
ALTER TABLE "new_RescueAvailability" RENAME TO "RescueAvailability";
CREATE INDEX "RescueAvailability_volunteerId_startsAt_idx" ON "RescueAvailability"("volunteerId", "startsAt");
CREATE TABLE "new_TransportAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volunteerId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "rrule" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportAvailability_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "TransportVolunteer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransportAvailability" ("createdAt", "endsAt", "id", "notes", "rrule", "startsAt", "updatedAt", "volunteerId") SELECT "createdAt", "endsAt", "id", "notes", "rrule", "startsAt", "updatedAt", "volunteerId" FROM "TransportAvailability";
DROP TABLE "TransportAvailability";
ALTER TABLE "new_TransportAvailability" RENAME TO "TransportAvailability";
CREATE INDEX "TransportAvailability_volunteerId_startsAt_idx" ON "TransportAvailability"("volunteerId", "startsAt");
CREATE TABLE "new_TransportShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volunteerId" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "rrule" TEXT,
    "role" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportShift_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "TransportVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransportShift" ("createdAt", "endsAt", "id", "notes", "role", "rrule", "startsAt", "status", "updatedAt", "volunteerId") SELECT "createdAt", "endsAt", "id", "notes", "role", "rrule", "startsAt", "status", "updatedAt", "volunteerId" FROM "TransportShift";
DROP TABLE "TransportShift";
ALTER TABLE "new_TransportShift" RENAME TO "TransportShift";
CREATE INDEX "TransportShift_volunteerId_startsAt_idx" ON "TransportShift"("volunteerId", "startsAt");
CREATE INDEX "TransportShift_startsAt_idx" ON "TransportShift"("startsAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerProfile_email_key" ON "VolunteerProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerProfile_fosterId_key" ON "VolunteerProfile"("fosterId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerProfile_transportId_key" ON "VolunteerProfile"("transportId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerProfile_rescueId_key" ON "VolunteerProfile"("rescueId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerMagicLink_tokenHash_key" ON "VolunteerMagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "VolunteerMagicLink_profileId_createdAt_idx" ON "VolunteerMagicLink"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsLedger_createdAt_idx" ON "SmsLedger"("createdAt");

-- CreateIndex
CREATE INDEX "SmsLedger_dedupeKey_createdAt_idx" ON "SmsLedger"("dedupeKey", "createdAt");

-- CreateIndex
CREATE INDEX "VolunteerEvent_profileId_createdAt_idx" ON "VolunteerEvent"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "VolunteerEvent_approvalStatus_createdAt_idx" ON "VolunteerEvent"("approvalStatus", "createdAt");
