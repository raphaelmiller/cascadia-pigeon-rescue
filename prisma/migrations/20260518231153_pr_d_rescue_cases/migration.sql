-- PR D: Rescue Cases
--
-- Hand-audited 2026-05-18. Like PR C v2, Prisma's auto-generated migration
-- bundled in unrelated drift fixes (Bird Int->Boolean casts, RescueAvailability
-- /TransportAvailability/TransportShift index reshuffles). All of those are
-- stripped here because:
--   (a) the drifts existed in prod before PR D and are harmless (SQLite stores
--       booleans as INTEGER anyway), and
--   (b) every table-redefine is a chance for the partial-failure mode that
--       took prod down during PR C v1.
--
-- This migration is strictly additive: three new tables, four new indexes.
-- No changes to any existing table. No DROP COLUMN, no NOT NULL on
-- existing tables, no table redefines.

-- ============================================================
-- RescueCase: a bird-in-the-field that's been reported but not
-- yet brought into the rescue. status field tracks the workflow:
-- needs_rescue / rescued / escaped_flew_away / closed_unable
-- ============================================================
CREATE TABLE "RescueCase" (
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
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescueCase_rescuedBirdId_fkey" FOREIGN KEY ("rescuedBirdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RescueCase_assignedVolunteerId_fkey" FOREIGN KEY ("assignedVolunteerId") REFERENCES "RescueVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RescueCase_status_createdAt_idx" ON "RescueCase"("status", "createdAt");
CREATE INDEX "RescueCase_archivedAt_deletedAt_idx" ON "RescueCase"("archivedAt", "deletedAt");

-- ============================================================
-- RescueCaseUpdate: append-only timeline of attempts /
-- observations / status changes per case.
-- ============================================================
CREATE TABLE "RescueCaseUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RescueCaseUpdate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RescueCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RescueCaseUpdate_caseId_attemptedAt_idx" ON "RescueCaseUpdate"("caseId", "attemptedAt");

-- ============================================================
-- RescueCasePhoto: photos uploaded for a case. Files live in the
-- existing uploads pipeline (R2 in prod, local disk in dev) under
-- folder "rescue-cases". URL column stores the canonical
-- /api/uploads/rescue-cases/<file> path.
-- ============================================================
CREATE TABLE "RescueCasePhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RescueCasePhoto_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RescueCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RescueCasePhoto_caseId_idx" ON "RescueCasePhoto"("caseId");
