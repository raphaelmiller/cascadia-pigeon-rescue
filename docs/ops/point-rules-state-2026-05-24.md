# Point Rules State — 2026-05-24 (post PR J)

Status of every `PointRule` kind in **prod Turso** and **dev DB** as of
2026-05-24 ~14:50 PT, after Rafa requested the new rescue rules be
flipped ON.

## Currently enabled

| Kind | Points | Approval | Notes |
|---|---|---|---|
| `rescue.resolved_deceased` | +5 | auto | **Enabled 2026-05-24** (PR J). Bird died at scene or found deceased — creates a memorial Bird record. |
| `rescue.unable_high_effort` | +2 | **pending review** | **Enabled 2026-05-24** (PR J). High-effort Unable bonus, goes to `/dispatch/queue` for coordinator judgment. |

That's it for explicitly-enabled rules today. Every other catalog entry
still ships `enabled=false`.

## Implicitly working (override path)

The following rules are `enabled=false` in `PointRule` but **are
awarding points correctly in the live system.** This is by design:
when `logEvent()` is called with an explicit `pointDelta` argument
(every rescue/transport resolution path does this), `evaluateRule()`
short-circuits and uses the override value regardless of `enabled`.

| Kind | Points | Approval | Source |
|---|---|---|---|
| `rescue.resolved_rescued` | +5 | auto | `resolveJob('rescued')` (PR D) |
| `rescue.resolved_escaped` | +2 | auto | `resolveJob('escaped_flew_away')` (PR D) |
| `rescue.resolved_unable` | +1 | auto | `resolveJob('closed_unable')` admin-only (PR H) |
| `rescue.unable_passed` | +1 | auto | `passUnable()` honest hand-off (PR H) |
| `rescue.field_note` | +1 | auto | `addRescueNoteAction()` capped per case (PR H) |
| `rescue.field_photo` | +2 | auto | `addRescueNoteAction()` capped per case (PR H) |
| `transport.delivered` | +5 | auto | `resolveJob('delivered')` (PR D) |

**The catch:** if Christina goes to `/volunteers/rules`, she'll see
these labeled "Disabled" which is confusing. Two ways to fix that
once she's reviewed them:

1. **Flip them ON** (matches reality) — recommended once she's read the
   labels + values and is happy with them.
2. **Remove the override path** — would force every event through the
   rule, but breaks current behavior until rules are flipped, and
   requires a fresh migration to enable them in lockstep.

Recommendation: do (1). Tell Christina to skim `/volunteers/rules`,
tune any point values she wants, then flip them ON. That's the model
the rules engine was designed for.

## Deceased + High-effort flip (what was done today)

Sequence:

1. PRs H/I/J shipped the new rules in the catalog (`rules-catalog.ts`)
   and the seed script (`scripts/seed-point-rules.mjs`), all with
   `enabled=false` per convention.
2. Prod Turso had never had `seed-point-rules.mjs` run after PR J, so
   the new rules didn't exist there yet.
3. Rafa asked to flip `rescue.resolved_deceased` and
   `rescue.unable_high_effort` ON.
4. **Dev DB:** ran the seed script (`DATABASE_URL=file:./prisma/dev.db
   node scripts/seed-point-rules.mjs` → "inserted 5, refreshed 43"),
   then `UPDATE PointRule SET enabled=1 WHERE kind IN (...)`.
5. **Prod Turso:** ran an inline node script over `fly ssh console -C`
   that imported the libsql client out of `/app/node_modules/@libsql/`
   and `INSERT ... ON CONFLICT DO UPDATE`-ed both rows with
   `enabled=1`. Verification queried back the rows; both showed
   `enabled=1, points=5/2`.
6. Wrote migration
   `20260524220000_pr_j_enable_deceased_and_high_effort` so any
   future fresh deploy reproduces this state without manual SSH.
   Idempotent via `ON CONFLICT(kind) DO UPDATE`.

## Re-running the flip safely (runbook)

If you ever need to enable a rule by hand against prod:

```bash
fly ssh console -a cascadia-pigeon-rescue -C "node --input-type=module -e \"
import { createClient } from '/app/node_modules/@libsql/client/lib-esm/node.js';
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
await c.execute({
  sql: 'UPDATE PointRule SET enabled=1, updatedAt=datetime(\\\"now\\\") WHERE kind = ?',
  args: ['rescue.WHATEVER'],
});
const r = await c.execute({ sql: 'SELECT kind, enabled, points FROM PointRule WHERE kind = ?', args: ['rescue.WHATEVER'] });
console.log(r.rows[0]);
\""
```

Note the escaping: the heredoc and the outer SSH `-C` argument both
need their own quoting. Use the `--input-type=module` flag so `await`
at top-level works.

## What to do next

- [ ] When Christina has 10 min, walk her through `/volunteers/rules`
      and decide which of the "implicitly working" rules to formally
      enable.
- [ ] Run `node scripts/seed-point-rules.mjs` against prod next deploy
      so the catalog rows exist there. Currently prod is missing the
      rows for `rescue.field_note`, `rescue.field_photo`,
      `rescue.unable_passed` etc. (See "Implicitly working" table.)
      One way: add a `seed-point-rules` step to the prod boot in
      `package.json` after `migrate-libsql`, gated on a flag so it
      doesn't slow every cold start.
