-- PR G (2026-05-19): Bird intake metadata flags + backstory +
-- WhereaboutsLogEntry table.
--
-- Additive only. Same discipline as PR C v2 / PR D / PR F.
-- - Three ALTER TABLE ADD COLUMN on Bird (all nullable or default 0).
-- - One CREATE TABLE + one CREATE INDEX for WhereaboutsLogEntry.
-- - No table redefines, no drift cleanups, no data backfill.
--
-- SQLite-via-libSQL dialect (Turso). Boolean columns stored as INTEGER
-- with default 0, matching every other boolean column in this schema
-- (currentlyQuarantined, clearedForIntegration, heatSupport, starred).
--
-- Rollback note: the custom migration runner does not support `down`.
-- If we need to revert, the contents of these objects are recoverable
-- from a Turso snapshot. Don't `DROP COLUMN` against the live DB
-- without a snapshot first.

-- 1. Intake flags. Independent of foundLocation/finderName/finderContact.
ALTER TABLE "Bird" ADD COLUMN "bornInCaptivity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Bird" ADD COLUMN "ownerSurrender" INTEGER NOT NULL DEFAULT 0;

-- 2. Freeform backstory. Plain text. Hard cap enforced in app-level
-- Zod schema (10,000 chars) — SQLite TEXT is effectively unlimited.
ALTER TABLE "Bird" ADD COLUMN "backstory" TEXT;

-- 3. WhereaboutsLogEntry table — append-mostly log of placements.
-- "Current whereabouts" is computed from MAX(recordedAt) per bird;
-- the app-level helper src/lib/whereabouts.ts falls back to
-- Bird.status when no log entries exist, so we do NOT need to
-- backfill historical birds with a synthetic row.
CREATE TABLE "WhereaboutsLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "birdId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "notes" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhereaboutsLogEntry_birdId_fkey"
        FOREIGN KEY ("birdId") REFERENCES "Bird" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Lookup index: every read path is "give me the latest log entry for
-- bird X" or "give me bird X's full log ordered by recordedAt".
CREATE INDEX "WhereaboutsLogEntry_birdId_recordedAt_idx"
    ON "WhereaboutsLogEntry" ("birdId", "recordedAt");
