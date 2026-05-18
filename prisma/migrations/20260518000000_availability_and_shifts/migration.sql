-- PR B — availability + shifts (2026-05-18).
--
-- Adds:
--   • TransportAvailability  (one-off or recurring blocks per driver)
--   • TransportShift         (scheduled on-duty windows per driver; NOT the same as TransportRequest)
--   • RescueAvailability     (one-off or recurring blocks per rescuer)
-- And extends:
--   • RescueShift  with rrule / role / status columns + a startsAt index
--
-- libSQL-compatible: each statement runs standalone (no transactions
-- spanning DDL + DML), no SQLite-specific PRAGMA, no FK rebuilds, all
-- column adds are additive. Net-new tables have no data backfill —
-- they start empty.

-- =========================================================
-- TransportAvailability
-- =========================================================
CREATE TABLE "TransportAvailability" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "volunteerId" TEXT NOT NULL,
    "startsAt"    DATETIME NOT NULL,
    "endsAt"      DATETIME NOT NULL,
    "rrule"       TEXT,
    "notes"       TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportAvailability_volunteerId_fkey"
      FOREIGN KEY ("volunteerId")
      REFERENCES "TransportVolunteer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TransportAvailability_volunteerId_startsAt_idx"
  ON "TransportAvailability"("volunteerId", "startsAt");

-- =========================================================
-- TransportShift
-- =========================================================
CREATE TABLE "TransportShift" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "volunteerId" TEXT,
    "startsAt"    DATETIME NOT NULL,
    "endsAt"      DATETIME NOT NULL,
    "rrule"       TEXT,
    "role"        TEXT,
    "notes"       TEXT,
    "status"      TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportShift_volunteerId_fkey"
      FOREIGN KEY ("volunteerId")
      REFERENCES "TransportVolunteer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TransportShift_volunteerId_startsAt_idx"
  ON "TransportShift"("volunteerId", "startsAt");

CREATE INDEX "TransportShift_startsAt_idx"
  ON "TransportShift"("startsAt");

-- =========================================================
-- RescueAvailability
-- =========================================================
CREATE TABLE "RescueAvailability" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "volunteerId" TEXT NOT NULL,
    "startsAt"    DATETIME NOT NULL,
    "endsAt"      DATETIME NOT NULL,
    "rrule"       TEXT,
    "notes"       TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RescueAvailability_volunteerId_fkey"
      FOREIGN KEY ("volunteerId")
      REFERENCES "RescueVolunteer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RescueAvailability_volunteerId_startsAt_idx"
  ON "RescueAvailability"("volunteerId", "startsAt");

-- =========================================================
-- RescueShift — extend with rrule / role / status, add an index.
-- The table already exists from the init migration; just append columns.
-- =========================================================
ALTER TABLE "RescueShift" ADD COLUMN "rrule"  TEXT;
ALTER TABLE "RescueShift" ADD COLUMN "role"   TEXT;
ALTER TABLE "RescueShift" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'scheduled';

CREATE INDEX "RescueShift_startsAt_idx" ON "RescueShift"("startsAt");
CREATE INDEX "RescueShift_volunteerId_startsAt_idx" ON "RescueShift"("volunteerId", "startsAt");
