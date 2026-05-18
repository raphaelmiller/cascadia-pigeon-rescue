-- PR C: Transport multi-stop support
--
-- Hand-audited 2026-05-18 by Rafa + main agent after a previous sub-agent
-- migration broke prod by including out-of-scope Bird/Rescue/Shift redefines
-- and a required `title` column. This migration is intentionally limited to
-- exactly what PR C needs:
--   1. Three new tables: TransportStop, TransportRequestBird, TransportStopBird
--   2. TransportRequest: add nullable `title`, add nullable `type`, make
--      `fromAddress` / `toAddress` / `pickupBy` nullable (legacy preserved)
--
-- Bird Int→Boolean drift, RescueAvailability/TransportAvailability/
-- TransportShift index reshuffles, and other schema noise from earlier
-- migrations are NOT touched here. SQLite stores Boolean as INTEGER 0/1
-- so the existing data works with the new client.
--
-- All changes are ADDITIVE or NULLABLE-RELAXING. No NOT NULL columns added
-- without defaults. No DROP COLUMN. Existing data preserved verbatim.

-- ============================================================
-- 1. New tables
-- ============================================================

CREATE TABLE "TransportStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "location" TEXT,
    "timeStart" DATETIME,
    "timeEnd" DATETIME,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportStop_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TransportStop_requestId_sortOrder_idx" ON "TransportStop"("requestId", "sortOrder");

CREATE TABLE "TransportRequestBird" (
    "requestId" TEXT NOT NULL,
    "birdId" TEXT NOT NULL,

    PRIMARY KEY ("requestId", "birdId"),
    CONSTRAINT "TransportRequestBird_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportRequestBird_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TransportStopBird" (
    "stopId" TEXT NOT NULL,
    "birdId" TEXT NOT NULL,

    PRIMARY KEY ("stopId", "birdId"),
    CONSTRAINT "TransportStopBird_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "TransportStop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportStopBird_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 2. TransportRequest: add columns + relax legacy NOT NULLs
--
-- SQLite can't ALTER COLUMN to drop NOT NULL, so we do the standard
-- "create new, copy data, drop old, rename" dance — but ONLY for this
-- one table. Everything else stays put.
-- ============================================================

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportRequest_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportRequest_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "TransportVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_TransportRequest" (
    "id", "birdId", "fromAddress", "toAddress", "pickupBy", "deliverBy",
    "description", "urgency", "status", "notes", "volunteerId",
    "createdAt", "updatedAt"
)
SELECT
    "id", "birdId", "fromAddress", "toAddress", "pickupBy", "deliverBy",
    "description", "urgency", "status", "notes", "volunteerId",
    "createdAt", "updatedAt"
FROM "TransportRequest";

DROP TABLE "TransportRequest";
ALTER TABLE "new_TransportRequest" RENAME TO "TransportRequest";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
