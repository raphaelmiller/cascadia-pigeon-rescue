-- Christina feedback (2026-05-25): bulk historical contributions admin page.
--
-- Christina asked for a lightweight way to backfill points for pre-portal
-- contributions: "send them all a template to write in how many birds
-- they've rescued, how many drives they've done approximately, how many
-- times they've helped coordinate, etc, and then put it in myself in a
-- 'historical points' section."
--
-- The new /volunteers/historical admin page reads these four
-- count-based PointRule rows and multiplies `points` by the count
-- Christina enters per volunteer. Enabled-by-default so the page works
-- on a fresh DB; Christina can still tune `points` (per-unit value) or
-- disable on the rules screen.
--
-- Per-unit defaults match the seed catalog suggestions:
--   rescues:        10 pts / bird
--   transport runs:  5 pts / drive
--   coordination:    3 pts / shift
--   fostering:       8 pts / bird placed

INSERT INTO "PointRule" (kind, label, description, category, suggestedPoints, points, enabled, createdAt, updatedAt)
VALUES (
  'historical.rescues_count',
  'Historical rescues (per bird)',
  'Per-bird credit for rescues performed before the portal existed.',
  'historical',
  10,
  10,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(kind) DO UPDATE SET
  enabled = 1,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO "PointRule" (kind, label, description, category, suggestedPoints, points, enabled, createdAt, updatedAt)
VALUES (
  'historical.transport_drives_count',
  'Historical transport drives (per drive)',
  'Per-drive credit for transport runs done before the portal.',
  'historical',
  5,
  5,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(kind) DO UPDATE SET
  enabled = 1,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO "PointRule" (kind, label, description, category, suggestedPoints, points, enabled, createdAt, updatedAt)
VALUES (
  'historical.coordination_count',
  'Historical coordination shifts (per shift)',
  'Per-shift credit for past coordinator / lead duties.',
  'historical',
  3,
  3,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(kind) DO UPDATE SET
  enabled = 1,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO "PointRule" (kind, label, description, category, suggestedPoints, points, enabled, createdAt, updatedAt)
VALUES (
  'historical.foster_count',
  'Historical foster placements (per bird)',
  'Per-bird credit for past fostering before the portal.',
  'historical',
  8,
  8,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(kind) DO UPDATE SET
  enabled = 1,
  updatedAt = CURRENT_TIMESTAMP;
