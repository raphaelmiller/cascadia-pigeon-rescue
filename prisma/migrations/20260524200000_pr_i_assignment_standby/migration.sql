-- PR I (2026-05-24) — Followers + take-over.
--
-- Adds standby state to Assignment so non-Point-Person paged volunteers
-- can register "I can back up" without claiming. Powers the take-over
-- flow when the PP goes dark past the heartbeat threshold.

ALTER TABLE "Assignment" ADD COLUMN "standbyAt" DATETIME;
ALTER TABLE "Assignment" ADD COLUMN "standbyClearedAt" DATETIME;

CREATE INDEX "Assignment_jobType_jobId_standbyAt_idx" ON "Assignment"("jobType", "jobId", "standbyAt");
