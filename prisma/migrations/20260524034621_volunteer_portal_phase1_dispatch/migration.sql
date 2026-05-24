-- CreateTable
CREATE TABLE "VolunteerAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'any',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "rrule" TEXT,
    "effectiveUntil" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VolunteerAvailability_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VolunteerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'notified',
    "notifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declinedAt" DATETIME,
    "claimedAt" DATETIME,
    "resolvedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'shift_overlap',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VolunteerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'timer',
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "outcome" TEXT,
    "smsFanout" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FosterCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "birdId" TEXT,
    "pulse" TEXT NOT NULL DEFAULT 'all_good',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FosterCheckIn_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VolunteerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FosterCheckIn_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RescueCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'needs_rescue',
    "birdDescription" TEXT,
    "issue" TEXT,
    "location" TEXT,
    "address" TEXT,
    "dateCalledIn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reporterName" TEXT,
    "reporterPhone" TEXT,
    "reporterContact" TEXT,
    "lastSeenAt" DATETIME,
    "lastSeenLocation" TEXT,
    "lastSeenNotes" TEXT,
    "notes" TEXT,
    "rescuedBirdId" TEXT,
    "assignedVolunteerId" TEXT,
    "emergencyFlag" BOOLEAN NOT NULL DEFAULT false,
    "deadline" DATETIME,
    "figuredOutAt" DATETIME,
    "pointPersonId" TEXT,
    "pointPersonClaimedAt" DATETIME,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescueCase_rescuedBirdId_fkey" FOREIGN KEY ("rescuedBirdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RescueCase_assignedVolunteerId_fkey" FOREIGN KEY ("assignedVolunteerId") REFERENCES "RescueVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RescueCase_pointPersonId_fkey" FOREIGN KEY ("pointPersonId") REFERENCES "VolunteerProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RescueCase" ("address", "archivedAt", "assignedVolunteerId", "birdDescription", "createdAt", "dateCalledIn", "deletedAt", "id", "issue", "lastSeenAt", "lastSeenLocation", "lastSeenNotes", "location", "notes", "reporterContact", "reporterName", "reporterPhone", "rescuedBirdId", "status", "updatedAt") SELECT "address", "archivedAt", "assignedVolunteerId", "birdDescription", "createdAt", "dateCalledIn", "deletedAt", "id", "issue", "lastSeenAt", "lastSeenLocation", "lastSeenNotes", "location", "notes", "reporterContact", "reporterName", "reporterPhone", "rescuedBirdId", "status", "updatedAt" FROM "RescueCase";
DROP TABLE "RescueCase";
ALTER TABLE "new_RescueCase" RENAME TO "RescueCase";
CREATE INDEX "RescueCase_status_createdAt_idx" ON "RescueCase"("status", "createdAt");
CREATE INDEX "RescueCase_archivedAt_deletedAt_idx" ON "RescueCase"("archivedAt", "deletedAt");
CREATE TABLE "new_TransportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "type" TEXT,
    "birdId" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "pickupBy" DATETIME,
    "deliverBy" DATETIME,
    "description" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "volunteerId" TEXT,
    "emergencyFlag" BOOLEAN NOT NULL DEFAULT false,
    "deadline" DATETIME,
    "figuredOutAt" DATETIME,
    "pointPersonId" TEXT,
    "pointPersonClaimedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportRequest_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportRequest_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "TransportVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportRequest_pointPersonId_fkey" FOREIGN KEY ("pointPersonId") REFERENCES "VolunteerProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransportRequest" ("birdId", "createdAt", "deliverBy", "description", "fromAddress", "id", "notes", "pickupBy", "status", "title", "toAddress", "type", "updatedAt", "urgency", "volunteerId") SELECT "birdId", "createdAt", "deliverBy", "description", "fromAddress", "id", "notes", "pickupBy", "status", "title", "toAddress", "type", "updatedAt", "urgency", "volunteerId" FROM "TransportRequest";
DROP TABLE "TransportRequest";
ALTER TABLE "new_TransportRequest" RENAME TO "TransportRequest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VolunteerAvailability_profileId_startsAt_idx" ON "VolunteerAvailability"("profileId", "startsAt");

-- CreateIndex
CREATE INDEX "VolunteerAvailability_profileId_kind_idx" ON "VolunteerAvailability"("profileId", "kind");

-- CreateIndex
CREATE INDEX "Assignment_jobType_jobId_idx" ON "Assignment"("jobType", "jobId");

-- CreateIndex
CREATE INDEX "Assignment_profileId_status_idx" ON "Assignment"("profileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_jobType_jobId_profileId_key" ON "Assignment"("jobType", "jobId", "profileId");

-- CreateIndex
CREATE INDEX "Escalation_jobType_jobId_tier_idx" ON "Escalation"("jobType", "jobId", "tier");

-- CreateIndex
CREATE INDEX "Escalation_closedAt_expiresAt_idx" ON "Escalation"("closedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "FosterCheckIn_profileId_createdAt_idx" ON "FosterCheckIn"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "FosterCheckIn_birdId_createdAt_idx" ON "FosterCheckIn"("birdId", "createdAt");
