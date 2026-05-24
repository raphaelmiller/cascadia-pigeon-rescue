-- PR J followup (2026-05-24): enable the two new rescue rules in PointRule
-- so any fresh DB / future redeploy starts with them ON, matching the
-- manual flip Rafa requested via SSH on this date.
--
-- These rules ship with `enabled=false` from the seed catalog by default
-- (every rule does — Christina opts in per-rule). Rafa asked to flip
-- these two ON the same day PR J landed; baking that into a migration
-- so we never lose the state on a rebuild.

-- Inserts the rows if missing, then enables them. Idempotent.
INSERT INTO "PointRule" (kind, label, description, category, suggestedPoints, points, enabled, createdAt, updatedAt)
VALUES (
  'rescue.resolved_deceased',
  'Bird found deceased',
  'PR J (2026-05-24). Bird died at the scene or was found already deceased. Volunteer did the work; outcome was outside their control. Creates a memorial Bird record (status=deceased).',
  'rescue',
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
  'rescue.unable_high_effort',
  'Rescue passed — high-effort (review)',
  'PR J (2026-05-24). Bonus for high-effort Unable attempts. Goes through coordinator review in /dispatch/queue — Christina + coordinators approve / reject / adjust based on context.',
  'rescue',
  2,
  2,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(kind) DO UPDATE SET
  enabled = 1,
  updatedAt = CURRENT_TIMESTAMP;
