-- Bird quarantine overhaul (2026-05-17).
--
-- Replaces the conflated `status='quarantine'` value with a pair of
-- booleans (currentlyQuarantined / clearedForIntegration) plus a
-- projected-clear partial-date triple (year required, month + day
-- optional, same pattern as foundDate*).
--
-- The booleans default to false and the date columns default to NULL,
-- so existing rows that weren't in quarantine status keep working
-- unchanged. Rows that *were* in quarantine status get migrated to
-- status='medical_hold' + currentlyQuarantined=1 in the data step at
-- the bottom of this file.
--
-- libSQL-compatible: each statement runs standalone (no transactions
-- spanning DDL + DML), no SQLite-specific PRAGMA, no foreign-key
-- rebuilds, all column adds are additive.

-- New boolean columns. 0/1 storage on SQLite, false default applied to
-- all existing rows.
ALTER TABLE "Bird" ADD COLUMN "currentlyQuarantined"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Bird" ADD COLUMN "clearedForIntegration" INTEGER NOT NULL DEFAULT 0;

-- Projected-cleared partial-date triple (year required at the form
-- layer, month + day optional). All three nullable so unset records
-- stay unset.
ALTER TABLE "Bird" ADD COLUMN "projectedClearedYear"  INTEGER;
ALTER TABLE "Bird" ADD COLUMN "projectedClearedMonth" INTEGER;
ALTER TABLE "Bird" ADD COLUMN "projectedClearedDay"   INTEGER;

-- Data migration: any bird previously in the `quarantine` clinical
-- status now lives at `medical_hold` with the quarantine flag flipped
-- on, so it shows up in the new UI exactly the way it used to.
UPDATE "Bird"
   SET "status" = 'medical_hold',
       "currentlyQuarantined" = 1
 WHERE "status" = 'quarantine';
