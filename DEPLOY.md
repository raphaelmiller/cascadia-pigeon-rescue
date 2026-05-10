# Deploy guide — Cascadia Pigeon Rescue

This is the production deploy playbook. Read it top to bottom before
pointing a domain at the app.

---

## ✅ What's built into the codebase

You don't need to do any of this — it's already wired:

- **Authentication.** Single shared admin password gate via next-auth
  credentials provider. Set `ADMIN_PASSWORD` and you're in. Sessions
  last 30 days, JWT-based (no auth DB tables needed).
- **Middleware-level gating.** Every page, every server action, every
  API route requires a valid session except `/login`, `/api/health`,
  and `/api/auth/*`. Logged-out callers redirect to `/login` with the
  original URL preserved.
- **Per-mutation auth check.** Every server action and write API route
  calls `requireOperator()` so direct POSTs from third-party origins
  bounce.
- **Object storage with R2.** Set `R2_*` env vars and uploads go to
  Cloudflare R2 (S3-compatible, no egress fees). Without them, falls
  back to local disk for dev. Same `/api/uploads/...` URL shape so the
  app code is storage-agnostic.
- **Auth-gated file streaming.** Photo + document URLs only resolve for
  logged-in users. No URL-guessing attacks.
- **Database migrations.** Baselined at `prisma/migrations/`. Use
  `npm run db:migrate:deploy` (or `npm run prod:start` which runs that
  + `next start`).
- **Env validator.** Refuses to boot in prod without `DATABASE_URL` /
  `TURSO_DATABASE_URL`, `AUTH_SECRET`, and `ADMIN_PASSWORD`.
- **Origin allowlist for server actions.** Set `ALLOWED_ORIGINS` (CSV)
  to your prod domain(s); everything else is rejected.
- **Input validation.** zod schemas validate enum-shaped fields (bird
  status, urgency, shift type, etc.) on every mutation.
- **Health endpoint.** `GET /api/health` returns `{ ok, uptimeMs,
  dbLatencyMs }` — wire your host's liveness probe to it.
- **Error + 404 pages.** `error.tsx` + `not-found.tsx` so users see
  calm fallbacks instead of a Next.js crash screen.
- **Atomic transactions.** Daily updates write the entry + foster
  stress + wellness log + whiteboard atomically. No more
  read-then-write races on whiteboard.
- **File cleanup on permanent delete.** Hard-deleting a bird/foster
  also removes their photos and documents from storage.
- **FK on TransportRequest.birdId.** No more dangling references when a
  bird is deleted.

---

## 🔴 What you must provide at deploy time

These are the env vars + decisions only you can make:

### Required env vars

```bash
# Auth — required
AUTH_SECRET=$(openssl rand -hex 32)   # rotate per environment
ADMIN_PASSWORD="something-strong"     # rotate to force re-login

# Database — pick ONE
DATABASE_URL="..."                    # Postgres / SQLite-on-volume / etc.
# OR
TURSO_DATABASE_URL="libsql://..."     # Turso (recommended)
TURSO_AUTH_TOKEN="..."

# Origin allowlist for server actions — required for prod
ALLOWED_ORIGINS="cpr-ops.example.com,www.cpr-ops.example.com"
```

### Required for production storage (pick one)

**Cloudflare R2 (recommended)** — S3-compatible, free egress, generous
free tier. Survives redeploys, multi-instance friendly:

```bash
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET="cpr-uploads"
```

To set up:
1. Create a bucket in the Cloudflare dashboard (R2 section).
2. Generate an R2 API token with **Object Read + Write** scope.
3. Plug values into the env vars above.

**Local persistent volume (single instance only)**:

```bash
UPLOADS_DIR="/var/lib/cpr/uploads"
```

Mount a persistent disk at that path. Files survive redeploys but
**won't** be visible to multiple instances.

### Database

**Turso (recommended)**:
```bash
turso db create cpr-prod
turso db tokens create cpr-prod
# Plug TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
```

After first deploy, run migrations once:
```bash
npm run db:migrate:deploy
```

(Or just use `npm run prod:start` as your start command — it runs
migrations then starts the server.)

### Backups

Before flipping DNS:
- **Turso**: enable point-in-time restore in the dashboard.
- **Postgres**: provider-native (Neon, Supabase, etc.).
- **SQLite-on-volume**: cron `litestream replicate` to S3/R2.

---

## 🟡 Recommended (not strictly required)

### Observability

`error.tsx` currently logs to `console.error`. For real incident response,
add Sentry:

```bash
npm i @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Then swap the `console.error` in `src/app/error.tsx` for
`Sentry.captureException(error)`.

### Image resize / thumbnails

Phone uploads can be 4-8MB. The app currently serves originals + uses
CSS to thumb them, which is fine at low scale. If pages start feeling
heavy, add `sharp` and generate a 256px thumb per upload.

### Rotating the admin password

Bump `ADMIN_PASSWORD` in your secret manager. Restart the app. All
existing JWT sessions remain valid until expiry (30 days), so for
immediate rotation also bump `AUTH_SECRET` — that invalidates every
session immediately.

---

## Deploy targets — cheat sheet

### Fly.io (single instance, easiest path)

```bash
fly launch
fly volume create cpr_uploads --size 10
fly secrets set \
  AUTH_SECRET=$(openssl rand -hex 32) \
  ADMIN_PASSWORD=your-strong-password \
  TURSO_DATABASE_URL=libsql://... \
  TURSO_AUTH_TOKEN=... \
  ALLOWED_ORIGINS=cpr-ops.fly.dev
fly deploy
```

In `fly.toml`:
- Mount the volume at `/var/lib/cpr/uploads`
- Set `UPLOADS_DIR=/var/lib/cpr/uploads`
- Use `npm run prod:start` as the start command
- Wire `[checks]` to `GET /api/health`

### Vercel (multi-instance, requires R2)

Local-disk uploads don't work on Vercel — must use R2. Add R2 env vars
and skip `UPLOADS_DIR`. Run `prisma migrate deploy` from CI before
deploy, not in the runtime.

### Self-hosted / VPS

Reverse-proxy with Caddy or nginx → `npm run prod:start` under systemd
or pm2. Either set `UPLOADS_DIR` to a backed-up path or use R2.

---

## Smoke checklist after first prod deploy

- [ ] Visit `/login` — password field works, wrong password shows error
- [ ] Log in successfully → lands on `/`
- [ ] Hit `/api/health` (no auth) → `{ ok: true }`
- [ ] Hit `/birds` while logged-out → 307 to `/login?next=/birds`
- [ ] Create a bird, upload a photo, set as profile, refresh — confirm photo loads
- [ ] Create a foster with avatar, confirm avatar shows on the foster list
- [ ] File a transport request linked to the bird, change status, confirm it appears on the calendar
- [ ] Soft-delete a bird, restore from `/archive`
- [ ] Hard-delete a bird, confirm files were removed from R2/storage
- [ ] Visit `/birds/nope` — see the not-found page, not a crash
- [ ] Click "Sign out" in the nav → lands back on `/login`
- [ ] Try `curl -X POST` on a write API route from a third-party origin → blocked
- [ ] Rotate `ADMIN_PASSWORD`, restart, log in with new password
