# Cascadia Pigeon Rescue · Operations Management

Internal rescue operations management system for Cascadia Pigeon Rescue (CPR).
Phase 1 MVP. Mobile-first. Color-coded triage. Built to reduce founder
bottlenecks and prevent foster burnout.

## Modules (Phase 1)

- 🏥 **Bird management** — intake to outcome, every status, every medical detail
- 🏠 **Foster management** — capabilities, capacity, contact, current state
- 🌡️ **Foster stress monitoring** — 1-10 scale with 6-color burnout-risk gauge
- 📌 **Foster whiteboard** — persistent visible standing concerns per foster
- 🔄 **Placement tracking** — bird ↔ foster history with reasons
- 💊 **Medication management** — refill alerts (7-day window), reassessments
- 📥 **Foster request portal** — supplies, meds, transport, vet
- 📝 **Daily foster updates** — bird health + foster stress in one form
- 📅 **Calendar** — vet, bandage, refill, transfer, follow-up
- 🎯 **Admin dashboard** — rescue command center

## Color triage (used everywhere)

| Color | Meaning |
|-------|---------|
| 🔴 Red | Urgent / overdue / severe burnout |
| 🟠 Orange | High concern / high strain |
| 🟡 Yellow | Upcoming / elevated |
| 🟢 Green | Stable / manageable |
| 🔵 Blue | Low concern / low stress |
| 🟣 Purple | Highly stable / completed |

## Tech

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Prisma 7 with adapter-based driver (better-sqlite3 local · libSQL/Turso prod)
- Mobile-first responsive layout (bottom-tab nav on phones, top nav on desktop)

## Local dev

```bash
npm install
npm run db:push        # apply schema to local SQLite
npm run db:seed        # seed demo birds, fosters, meds, requests
npm run dev
```

Open http://localhost:3000

## Production deploy (Vercel + Turso)

1. Create a Turso DB: `turso db create cpr-rescue` then `turso db tokens create cpr-rescue`
2. In Vercel project settings, set env vars:
   - `TURSO_DATABASE_URL` = libsql URL from `turso db show cpr-rescue`
   - `TURSO_AUTH_TOKEN`   = the token from step 1
3. Push migrations to Turso:
   ```bash
   turso db shell cpr-rescue < prisma/migrations/manual.sql
   ```
   (or use `prisma db push` with `TURSO_DATABASE_URL` exported to a libsql-compatible URL)
4. Vercel auto-deploys on every push to `main`.

## Phase 2 (next)

- Transport coordination
- Rescue shift scheduling
- Reminder digest (daily push)
- Refill auto-forecasting
- Bandage task automation
- Supply inventory

## Phase 3 (later)

- SMS automation
- Public adoption portal
- Volunteer applications
- Analytics + AI prioritization
