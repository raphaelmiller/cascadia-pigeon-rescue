-- Medication catalog + units (2026-05-17).
--
-- Adds a catalog of medication names Christina has seen before, so the
-- create / edit forms on a bird can offer autocomplete. Phase-1 scope
-- is strictly (name, defaultUnits) — no default frequency, no default
-- route, nothing else. Anything richer is a later phase.
--
-- Also adds a free-text `units` column on Medication so the form has
-- somewhere to store the units once they're picked from the datalist.
-- Defaults to NULL so existing meds keep rendering exactly as before.

-- Free-text units on the per-bird Medication row.
ALTER TABLE "Medication" ADD COLUMN "units" TEXT;

-- The catalog itself. Name is unique so re-typing the same med doesn't
-- create duplicate rows. defaultUnits is whatever was typed the first
-- time and is surfaced as the suggested default next time.
CREATE TABLE "MedicationCatalog" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "name"         TEXT NOT NULL,
    "defaultUnits" TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "MedicationCatalog_name_key" ON "MedicationCatalog"("name");
