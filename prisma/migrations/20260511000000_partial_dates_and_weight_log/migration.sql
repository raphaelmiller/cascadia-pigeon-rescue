-- Partial "date found" / "date joined" + ongoing weight log.
--
-- Both changes are purely additive — existing rows keep working
-- (new columns default to NULL, new table is empty).

-- Bird: date found (year required, month + day optional)
ALTER TABLE "Bird" ADD COLUMN "foundDateYear"  INTEGER;
ALTER TABLE "Bird" ADD COLUMN "foundDateMonth" INTEGER;
ALTER TABLE "Bird" ADD COLUMN "foundDateDay"   INTEGER;

-- Foster: date joined (same partial-date triple)
ALTER TABLE "Foster" ADD COLUMN "joinedDateYear"  INTEGER;
ALTER TABLE "Foster" ADD COLUMN "joinedDateMonth" INTEGER;
ALTER TABLE "Foster" ADD COLUMN "joinedDateDay"   INTEGER;

-- WeightEntry: ongoing weight log per bird
CREATE TABLE "WeightEntry" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "birdId"     TEXT NOT NULL,
    "grams"      REAL NOT NULL,
    "measuredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes"      TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightEntry_birdId_fkey" FOREIGN KEY ("birdId") REFERENCES "Bird" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WeightEntry_birdId_measuredAt_idx" ON "WeightEntry"("birdId", "measuredAt");
