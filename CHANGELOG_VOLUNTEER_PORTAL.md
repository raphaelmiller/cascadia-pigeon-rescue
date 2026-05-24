# Volunteer Portal — Shipping Changelog

Append-only log of what shipped per session. Lets us pick up where we
left off without rebuilding context.

---

## 2026-05-23 — Phase 0 → Phase 2 ship (Rafa + AI)

Single very long session. Four phases of work, four QA cycles. End state:
volunteer portal fully functional on a temp tryCloudflare URL, demoed to
Christina that evening.

### Phase 0: Identity foundation

**Goal:** establish the architecture (route-group split, per-volunteer
identity, scoped auth) without changing any admin behavior.

**Architecture decision:** Option A — same Next.js app, separate route
groups, host-aware middleware. Two true root layouts (`(admin)/layout.tsx`
and `(volunteer)/v/layout.tsx`). Volunteer host rewrites to `/v/*` paths
internally; user sees clean subdomain URLs.

**Files added (new):**
- `src/middleware.ts` — extended with host detection + per-portal cookie scope
- `src/app/(volunteer)/v/layout.tsx` — true volunteer root layout
- `src/app/(volunteer)/v/login/page.tsx` — magic-link form + dev-bypass dropdown
- `src/app/(volunteer)/v/auth/{sent,callback}/page.tsx` — magic-link flow pages
- `src/app/(volunteer)/v/page.tsx` — volunteer dashboard
- `src/app/(volunteer)/v/profile/page.tsx` + `actions.ts` — self-edit
- `src/app/(volunteer)/v/not-found.tsx` — volunteer-chrome 404 (no admin leak)
- `src/components/volunteer/VolunteerNav.tsx` — role-tag-aware nav
- `src/components/volunteer/PhaseStub.tsx` — temporary placeholder pattern (later removed)
- `src/lib/notify/email.ts` — Resend adapter (stub | live | disabled)
- `src/lib/notify/sms.ts` — Twilio adapter (stub | live | disabled) + ledger
- `src/lib/volunteer/roles.ts` — 13-tag role vocabulary
- `src/lib/volunteer/magic-link.ts` — token issue/consume with SHA-256 hash
- `src/lib/volunteer/auth.ts` — `requireVolunteer()` + `requireAnyRole()`
- `src/lib/volunteer/events.ts` — VolunteerEvent logger (Phase 1) + later evolved (Phase 2)
- `scripts/seed-volunteer-portal.mjs` — seeds Maya, Theo, Sam + (Phase 1.5) Christina

**Files moved:**
- All admin routes from `src/app/*` → `src/app/(admin)/*` (route group rename, URLs unchanged)
- Volunteer routes from `src/app/v/*` → `src/app/(volunteer)/v/*` (route group rename)

**Schema migration:** `20260524002837_volunteer_portal_phase0`
- New: `VolunteerProfile`, `VolunteerMagicLink`, `SmsLedger`, `VolunteerEvent`
- Bird flagged additions for PR-G fields (`bornInCaptivity`, `ownerSurrender`, `backstory`, etc.) reconciled in the migration

**QA pass 1 (mid-session):** 18 issues found, 3 blockers:
1. Admin root layout wrapped volunteer portal — wrong route-group config
2. Literal `\uXXXX` escapes rendering as visible text in 6 files
3. Five secondary routes (`/birds`, `/transport`, `/rescue`, `/shifts`, `/dispatch`) didn't exist → 404'd into admin chrome

All three fixed plus the 6 HIGH issues. QA pass 2 (after fixes) confirmed clean.

### Phase 1: Dispatch core

**Goal:** real-time job dispatch — when Christina files a rescue or
transport job, every eligible volunteer gets pinged, claim flow + tiered
escalation, emergency fast-path.

**Files added (new):**
- `src/lib/volunteer/dispatch.ts` — `dispatchJob`, `sweepEscalations`, `claimPointPerson`, `markUnavailable`, `markFiguredOut`, `runPreShiftNudges`
- `src/lib/volunteer/assignments-query.ts` — "Awaiting your action" feed query
- `src/lib/volunteer/assignment-history.ts` — `/v/transport`, `/v/rescue` per-volunteer history
- `src/lib/volunteer/dispatch-board.ts` — coordinator board query (every open job, joined with escalations + assignments)
- `src/app/(volunteer)/v/actions.ts` — claim, decline, figured-out, resolve actions
- `src/app/(volunteer)/v/dispatch/page.tsx` + `actions.ts` — coordinator board
- `src/app/(volunteer)/v/{birds,transport,rescue,shifts}/page.tsx` — real list pages (no longer PhaseStub)
- `src/app/(volunteer)/v/birds/actions.ts` — foster check-in
- `src/app/(volunteer)/v/shifts/actions.ts` — availability save/delete
- `src/components/volunteer/AssignmentCard.tsx` + `HistoryRow.tsx` — UI primitives
- `src/app/(admin)/api/dispatch/sweep/route.ts` — header-token cron endpoint

**Files modified:**
- `src/app/(admin)/rescue/cases/new/page.tsx` — emergency checkbox + deadline field + `dispatchJob()` post-create
- `src/app/(admin)/transport/requests/new/form.tsx` — same
- `src/lib/volunteer/dispatch.ts` (later) — coordinator-volunteers included in T1 (initial bug: they were filtered out)
- `src/middleware.ts` — public-path allowlist for `/api/dispatch/sweep`

**Schema migration:** `20260524034621_volunteer_portal_phase1_dispatch`
- New: `VolunteerAvailability`, `Assignment` (polymorphic via `jobType`+`jobId`), `Escalation`, `FosterCheckIn`
- Extended: `RescueCase` + `TransportRequest` with `emergencyFlag`, `deadline`, `pointPersonId`, `figuredOutAt`, `pointPersonClaimedAt`
- VolunteerProfile got reverse relations

**Verified end-to-end in browser:**
- Admin → rescue case w/ Emergency checkbox → both Theo + Sam got stub SMS (`uploads/_outbox/sms.log`)
- Theo signed in, saw "Awaiting your action", tapped Claim Point Person → 3 pts banked, escalation closed
- Sam (coordinator) saw same case on `/dispatch` with "Point Person: Theo Park"
- Emergency case triggered T1+T2+T3 escalations in one transaction

### Phase 1.5: Polish (items 6-13)

**Goal:** close every "you'd have to bounce to the admin app for X" gap.

- **Status transitions** (`src/lib/volunteer/job-resolution.ts`): shared resolve primitive used by both admin + volunteer surfaces. Rescued/Escaped/Unable + In Transit/Delivered/Cancelled buttons added to `AssignmentCard`.
- **Coordinator dispatch-board actions** (`src/app/(volunteer)/v/dispatch/actions.ts`): re-dispatch, manual claim with dropdown, force-escalate.
- **Approval queue widget + page** (`src/lib/volunteer/pending-reviews.ts` + `/v/dispatch/queue`): all `approvalStatus=pending` events surface here; email-change requests can be approved with auto-swap, point claims can be approved/rejected.
- **Christina profile + admin onboarding UI** (`src/app/(admin)/volunteers/*`): list, create, edit, disable, role-pick, link to legacy records. Christina seeded via `scripts/seed-volunteer-portal.mjs`. Dispatch engine T3 looks up by `CHRISTINA_EMAIL` env (defaults to `christina@cascadiapigeonrescue.org`) with `CHRISTINA_PHONE` env fallback.
- **2-min pre-shift nudge**: `runPreShiftNudges()` inside `sweepEscalations` — when a job's deadline is <5min and unclaimed, all coordinators get pinged once (dedupe per (job, coordinator) via SmsLedger).
- **Foster check-in soft nudge**: in-portal-only blue banner on `/v/birds` after 3+ days since last check-in. No SMS, no nag. Tunable via `CHECKIN_NUDGE_AFTER_DAYS`.
- **Daily volunteer digest** (`src/lib/volunteer/digest.ts` + `/api/dispatch/digest`): opt-in via `digestEnabled` field on `VolunteerProfile`. One SMS per day per opted-in volunteer summarizing what's on their plate; skips silent days; date-stamped dedupe key.
- **Availability conflict warnings**: `saveAvailability` runs `detectOverlaps()` against the volunteer's other blocks; advisory banner ("saved with overlap") not blocking.

**Schema migration:** `20260524044138_volunteer_portal_phase1_5`
- Added: `VolunteerProfile.digestEnabled`

### Phase 2: Recognition (items 14-15)

**Decision:** option C — engine + UI ship, every rule disabled by default
with a suggested value visible. Christina enables what she wants and
tunes values from the admin UI.

**Files added (new):**
- `src/lib/volunteer/rules-catalog.ts` — 43 rules across 6 categories (Rescue / Transport / Foster / Check-in / Coordination / Historical)
- `src/lib/volunteer/rules.ts` — `evaluateRule()` consulted by `logEvent`; supports per-rule autoApproveMax override
- `src/lib/volunteer/service-record.ts` — per-volunteer aggregate query: by-category breakdown, reliability score (claims/declines/timeouts → 0-100), activity score (events 30d/90d → 0-100, decayed if dormant)
- `src/app/(volunteer)/v/service-record/page.tsx` — trophy hero, two gauges, category bars, recent activity feed. No leaderboards.
- `src/app/(admin)/volunteers/rules/page.tsx` + `actions.ts` — per-rule edit, bulk enable/disable per category
- `src/app/(admin)/volunteers/[id]/seed/page.tsx` + `actions.ts` — bulk historical-points seeder per volunteer
- `scripts/seed-point-rules.mjs` — idempotent PointRule seed (preserves existing edits to `points` + `enabled`)

**Files modified:**
- `src/lib/volunteer/events.ts` — `logEvent` now consults `evaluateRule`; backward-compat with override semantics
- `src/components/volunteer/VolunteerNav.tsx` — added "Record" tab
- `src/components/Nav.tsx` (admin) — added "Volunteers" tab

**Schema migration:** `20260524044406_volunteer_portal_phase2_rules`
- New: `PointRule` table (kind PK, suggested + actual points, enabled flag, optional autoApproveMax)

**Seeded after migration:** 43 PointRule rows (all `enabled: false`).

### Session-closing additions

- **System status banner** (`src/components/volunteer/SystemStatusBanner.tsx`): surfaces SMS/email stub mode + dev-bypass status on `/v/dispatch` and `/volunteers`. Renders nothing in production (silent when everything is live).
- **`/volunteers/rules` explainer banner**: friendly blue "this is the control panel — nothing's broken" message when 0 rules are enabled, with a workflow walkthrough and a recommended-first-rule tip.
- **`CHRISTINA_WALKTHROUGH.md`**: 5-minute path doc for Christina's first walk-through.
- **`README.md`**: rewritten to document both surfaces + all current env vars + deploy steps.

### Stack changes

- Installed: `resend@^4.x`, `twilio@^5.x`
- `next.config.ts`: added `allowedDevOrigins` so Turbopack accepts the tunnel hosts during dev

### Test infrastructure left in repo

- `qa-screenshots/2026-05-23/` — first full QA pass (18 issues found)
- `qa-screenshots/2026-05-23-after-fix/` — verification after Phase 0 fixes
- `qa-screenshots/2026-05-23-phase1-verify/` — Phase 1 verification (admin-leak check + Phase-1-leftover scan)
- `QA_REPORT_PHASE0.md`, `QA_REPORT_PHASE1_VERIFY.md` — written by sub-agents during QA passes

### End-state metrics

- **14 migrations applied** (4 new from this session)
- **~5,500 lines of new code** in `src/{lib,app,components}/(volunteer|admin/volunteers|notify)/`
- **43 PointRules** seeded, all disabled
- **4 seeded test volunteers** (Christina, Maya, Theo, Sam)
- **0 TypeScript errors**, production build passing
- **Zero admin chrome leak** onto volunteer surface (verified twice)

### Known TODOs (carry into next session)

1. **Real Resend + Twilio credentials** — stubs work; flip env vars to live
2. **Production deploy** — currently on Rafa's Mac via tryCloudflare tunnels; deploy to Vercel + Turso
3. **Cron pings** in production — `/api/dispatch/sweep` every 60s, `/api/dispatch/digest` daily at 07:00 PT
4. **Christina's real phone number** — currently `+15035550100` placeholder
5. **Onboard the actual volunteers** — via the new admin `/volunteers` UI
6. **Christina tunes the 43 rules** before turning them on
7. **Bulk-seed historical points** for existing volunteers via the new seeder

### Decisions worth remembering

- **Polymorphic Assignment / Escalation via `jobType` + `jobId`** (soft FK): chose this over discriminator tables so new job types can be added without DDL.
- **Coordinator-volunteers DO get T1 SMS** (initial bug filtered them out): being a coordinator doesn't suppress on-shift notifications; coordinators-not-in-T1-candidate-set get T2.
- **First claim wins, atomic**: `prisma.rescueCase.updateMany({ where: { id, pointPersonId: null OR me } })` — defeats races.
- **Forge resolution path through ONE primitive**: `resolveJob()` in `job-resolution.ts` is called by both admin + volunteer surfaces. No drift.
- **Stub-mode is the safe default for both Resend + Twilio**: turning either off mid-flight should never crash dispatch; ledger + outbox file capture intent.
- **Recognition values are SUGGESTIONS**: Christina tunes before enabling. Seeded numbers are starting points only.
- **No leaderboards**: explicit Christina constraint; service record is per-person only.
</content>
