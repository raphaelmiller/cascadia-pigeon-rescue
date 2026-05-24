# Cascadia Pigeon Rescue · Operations + Volunteer Portal

Internal rescue operations system for Cascadia Pigeon Rescue (CPR). One
Next.js app, two surfaces (admin + volunteer), one database. Mobile-first,
color-coded triage, built to reduce founder bottlenecks.

## Two surfaces, one app

| Surface | Host | Audience | Login |
|---|---|---|---|
| **Admin** (`/`, `/birds`, `/fosters`, …) | root domain | Christina (founder) | shared admin password |
| **Volunteer** (`/`, `/birds`, `/transport`, `/rescue`, `/dispatch`, …) | `volunteer.*` subdomain | fosters, drivers, rescuers, coordinators | magic-link email (Resend) — per-volunteer identity |

Subdomain detection lives in `src/middleware.ts`. The volunteer host is
rewritten internally to `/v/*` paths so each route group has its own
root layout, with **zero cross-portal nav leakage**. Auth sessions are
scoped to their host via NextAuth JWT + role-aware middleware: a volunteer
session can't reach the admin host and vice versa.

## Modules

### 🏥 Admin surface
- **Bird management** — intake to outcome, every status, every medical detail
- **Foster management** — capabilities, capacity, contact, stress + whiteboard
- **Placement tracking** — bird ↔ foster history with reasons
- **Medication management** — refill alerts (7-day window), reassessments
- **Rescue cases** — bird-in-the-field reports, multi-volunteer dispatch
- **Transport coordination** — multi-stop, multi-bird, availability + shifts
- **Volunteer profiles** (Phase 0+) — onboard, role-tag, link to legacy records
- **Point-rules engine** (Phase 2) — 43 recognized events with admin tuning
- **Bulk historical-points seeder** (Phase 2) — grant retroactive credit
- **Approval queue** (Phase 2) — coordinator-reviewed pending events
- **Calendar / Bandages / Supplies / Updates** — Phase 1 modules

### 🐦 Volunteer surface
- **Home** — "Awaiting your action" feed with urgency-toned cards
- **Dispatch loop** — auto-assigned on shift overlap; claim Point Person; resolve job
- **Tiered escalation** — T1 (15min) → T2 coordinators (15min) → T3 Christina
- **Emergency fast-path** — `deadline < 30min` or explicit flag fans T1+T2+T3 simultaneously
- **Status transitions** — Rescued / Escaped / Unable / In Transit / Delivered / Cancelled, in-portal
- **Coordinator dispatch board** (`/dispatch`) — every open job + re-dispatch / manual-claim / escalate / approval queue
- **My Birds** — foster check-in with three-pulse picker + bird selector + +1 pt reward
- **Transport + Rescue history** — active + 30-day recent, role-gated
- **Availability v2** — 5 kinds (one_time / weekly / indefinite / always / custom) with overlap warnings
- **Service record** (Phase 2) — total points, by-category breakdown, reliability + activity scores
- **Profile** — self-edit name/phone/role-fields; email change via coordinator approval

## Notifications

| Channel | Provider | Mode | Trigger |
|---|---|---|---|
| Magic-link auth | Resend (HTTP) | stub-by-default; flip via `RESEND_API_KEY` | volunteer login |
| Dispatch SMS | Twilio (HTTP) | stub-by-default; flip via `TWILIO_ACCOUNT_SID` | escalation tiers + nudges + daily digest |

SMS has a **monthly $-ceiling** (`SMS_MONTHLY_CEILING_USD`, default `$50`)
enforced via `SmsLedger`. Every send (real or stub) records cost so the
ceiling is meaningful before flipping to live. Dedupe key per (event ×
recipient) prevents fan-out loops.

## Color triage

| Color | Meaning |
|-------|---------|
| 🔴 Red | Emergency / urgent / overdue / severe burnout |
| 🟠 Orange | High concern / escalated / high strain |
| 🟡 Yellow | Upcoming / elevated / advisory |
| 🟢 Green | Stable / claimed-by-you / manageable |
| 🔵 Blue | Low concern / info / pending review |
| 🟣 Purple | Highly stable / coordinator-flagged / completed |

## Tech

- Next.js 16 (App Router, Turbopack)
- TypeScript + Tailwind v4
- Prisma 7 with adapter-based driver: `better-sqlite3` local, libSQL/Turso prod
- NextAuth v5 (JWT, two providers: admin Credentials + volunteer magic-link)
- Resend (transactional email) — stubbed by default
- Twilio (SMS) — stubbed by default
- Mobile-first responsive (bottom-tab nav on phones, top nav on desktop)
- Two route groups: `src/app/(admin)/` and `src/app/(volunteer)/v/`

## Local dev

```bash
npm install
npm run db:push                          # apply schema to local SQLite
npm run db:seed                          # seed demo birds, fosters, meds, requests
node scripts/seed-volunteer-portal.mjs   # seed test volunteer profiles
node scripts/seed-point-rules.mjs        # seed 43 PointRule rows (all disabled)
npm run dev
```

Open:
- Admin: <http://localhost:3000>
- Volunteer: <http://volunteer.localhost:3000>

`volunteer.localhost` resolves locally with no DNS config needed.

### Dev-bypass auth

Set `DEV_BYPASS_AUTH=1` in `.env` to make the volunteer `/login` page show
a dropdown of all seeded volunteers — pick one and sign in instantly,
no magic link required. Guarded twice (env flag + `NODE_ENV !== 'production'`).
**Never** enable in production without also setting `DEV_BYPASS_FORCE=1`
(explicit foot-gun).

## Required env vars

See `.env.example` for the full list. Highlights:

| Var | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | prod | NextAuth JWT secret. Rotate per environment. |
| `ADMIN_PASSWORD` | prod | Shared admin login. Rotate to force re-login. |
| `DATABASE_URL` or `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | prod | Data plane |
| `R2_*` | prod | Cloudflare R2 storage for uploads |
| `VOLUNTEER_HOST_PREFIX` | optional | Default `volunteer`; the subdomain label |
| `VOLUNTEER_HOSTNAMES` | optional | Explicit hostname overrides (comma-sep) for non-prefix setups (e.g. tryCloudflare tunnels) |
| `RESEND_API_KEY` | when going live | Magic-link email |
| `RESEND_FROM` | optional | `CPR <noreply@yourdomain>`; defaults to onboarding@resend.dev |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` | when going live | SMS dispatch |
| `SMS_MONTHLY_CEILING_USD` | recommended | Default `50`. Hard cap. |
| `CHRISTINA_EMAIL` | optional | Defaults to `christina@cascadiapigeonrescue.org` for T3 escalation lookup |
| `CHRISTINA_PHONE` | recommended | Fallback if no Christina VolunteerProfile exists |
| `DISPATCH_CRON_TOKEN` | prod | Header-token auth for cron-poked endpoints |
| `POINT_AUTO_APPROVE_MAX` | optional | Default `5`. Event points <= this auto-approve. |
| `PRE_SHIFT_NUDGE_MIN` | optional | Default `5` min. Window for pre-shift coordinator nudge. |
| `CHECKIN_NUDGE_AFTER_DAYS` | optional | Default `3` days. Foster check-in soft nudge threshold. |

## Production deploy (Vercel + Turso)

1. Create a Turso DB: `turso db create cpr-rescue` then `turso db tokens create cpr-rescue`
2. In Vercel project settings, set env vars (see table above).
3. Push migrations: `prisma migrate deploy` with `TURSO_DATABASE_URL` exported.
4. Vercel auto-deploys on every push to `main`.
5. Configure DNS: point your apex domain at Vercel; add `volunteer.yourdomain` as an alias to the same project.
6. **Configure cron pings** (Vercel Cron / GitHub Actions / Fly machine cron):
   - Every 60s: `POST /api/dispatch/sweep` with `X-Dispatch-Token: <DISPATCH_CRON_TOKEN>`
   - Daily ~07:00 PT: `POST /api/dispatch/digest` with same header
7. Run `node scripts/seed-point-rules.mjs` against production DB (idempotent).

## Project phases

### Phase 0 — Identity foundation ✅
Route-group split, magic-link auth, VolunteerProfile model, dev bypass, subdomain middleware.

### Phase 1 — Dispatch core ✅
Availability v2, Assignment + Escalation models, dispatch engine, emergency fast-path, SMS pipeline, volunteer dashboard + claim flow, coordinator dispatch board, admin emergency-flag + deadline on jobs.

### Phase 1.5 — Polish ✅
Status transitions in portal, coordinator dispatch-board actions, approval queue, Christina profile + admin onboarding UI, 5-min pre-shift nudge, soft check-in nudge, daily digest, availability conflict warnings.

### Phase 2 — Recognition ✅
Point-rules engine (43 rules, disabled-by-default), service record page (no leaderboards), reliability + activity scoring, bulk historical-points seeder for retroactive credit.

### Phase 3 — TBD
Public adoption portal, volunteer applications self-service, analytics, AI-assisted prioritization.

## Documentation

- `VOLUNTEER_PORTAL_SPEC.md` — original spec the volunteer portal was built against
- `CHRISTINA_WALKTHROUGH.md` — 5-minute path through the new UX for Christina
- `CHANGELOG_VOLUNTEER_PORTAL.md` — session-by-session shipping log
- `QA_REPORT_PHASE0.md` — first full QA pass (3 blockers + 6 highs + …, all fixed)
- `QA_REPORT_PHASE1_VERIFY.md` — verification pass on Phase 0 fixes + Phase 1 readiness
- `qa-screenshots/` — visual proof at each milestone
</content>
