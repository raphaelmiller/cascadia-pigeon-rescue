-- PR H (2026-05-24) — Undo close + Unable-escalate + Rescue note authorship.
--
-- 1. RescueCase gains: unableReason, unablePassedCount, resolvedAt,
--    resolvedByProfileId, resolvedReversedAt.
-- 2. TransportRequest gains: resolvedAt, resolvedByProfileId, resolvedReversedAt.
-- 3. RescueCaseUpdate gains: authorProfileId (FK), category.
-- 4. VolunteerEvent gains: reversedAt, reversedReason.
-- 5. New indexes for resolved-at queries + ref lookups.
--
-- All adds are non-destructive: nullable columns / defaulted ints.

ALTER TABLE "RescueCase" ADD COLUMN "unableReason" TEXT;
ALTER TABLE "RescueCase" ADD COLUMN "unablePassedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RescueCase" ADD COLUMN "resolvedAt" DATETIME;
ALTER TABLE "RescueCase" ADD COLUMN "resolvedByProfileId" TEXT;
ALTER TABLE "RescueCase" ADD COLUMN "resolvedReversedAt" DATETIME;

ALTER TABLE "TransportRequest" ADD COLUMN "resolvedAt" DATETIME;
ALTER TABLE "TransportRequest" ADD COLUMN "resolvedByProfileId" TEXT;
ALTER TABLE "TransportRequest" ADD COLUMN "resolvedReversedAt" DATETIME;

ALTER TABLE "RescueCaseUpdate" ADD COLUMN "authorProfileId" TEXT REFERENCES "VolunteerProfile"("id") ON DELETE SET NULL;
ALTER TABLE "RescueCaseUpdate" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'system';

ALTER TABLE "VolunteerEvent" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "VolunteerEvent" ADD COLUMN "reversedReason" TEXT;

CREATE INDEX "RescueCase_resolvedAt_idx" ON "RescueCase"("resolvedAt");
CREATE INDEX "TransportRequest_resolvedAt_idx" ON "TransportRequest"("resolvedAt");
CREATE INDEX "VolunteerEvent_refType_refId_idx" ON "VolunteerEvent"("refType", "refId");
CREATE INDEX "RescueCaseUpdate_authorProfileId_idx" ON "RescueCaseUpdate"("authorProfileId");
