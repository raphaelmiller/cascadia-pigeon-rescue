# Fly.io Deploy — step by step

This is the **execution playbook** for deploying CPR Ops to Fly.io. Total
time start-to-finish: ~20 min.

You'll do steps that need a browser (Cloudflare R2 setup, Fly auth). I'll
do everything else once you give me the values.

---

## 0. One-time prereqs (you, ~5 min)

### 0.1 — Authenticate with Fly

```bash
fly auth login
```

Opens a browser. Sign up if you haven't.

### 0.2 — Create the Turso database

```bash
brew install tursodatabase/tap/turso  # if not already
turso auth login                      # opens browser
turso db create cpr-prod
turso db tokens create cpr-prod
```

Save the URL + token from the last two commands. You'll need:
- `TURSO_DATABASE_URL` (starts with `libsql://`)
- `TURSO_AUTH_TOKEN`

### 0.3 — Create a Cloudflare R2 bucket

1. Go to https://dash.cloudflare.com → R2 → "Create bucket"
2. Name it `cpr-uploads` (or whatever). Default region is fine.
3. After creation, click "Manage R2 API Tokens" → "Create API Token"
4. Permissions: **Object Read & Write**, scope to your new bucket
5. Copy the four values it shows you:
   - Account ID (top of the R2 page)
   - Access Key ID
   - Secret Access Key
   - Bucket name (the one you just made)

### 0.4 — Pick an admin password

Something strong. You'll share this with anyone who needs admin access.

```bash
# Quick generator if you want one:
openssl rand -base64 24
```

---

## 1. Provision the Fly app (you, 1 min)

```bash
cd ~/.openclaw/workspace/projects/cascadia-pigeon-rescue
fly launch --no-deploy --copy-config --name cascadia-pigeon-rescue --region sea
```

When it asks "Would you like to set up a Postgres database?" → **No**
(we're using Turso). Same for Redis → **No**.

This creates the app on Fly's side and reuses our existing `fly.toml`.

---

## 2. Set the secrets (you or me, 1 min)

```bash
fly secrets set \
  AUTH_SECRET="$(openssl rand -hex 32)" \
  ADMIN_PASSWORD="<your-strong-password>" \
  TURSO_DATABASE_URL="libsql://cpr-prod-<your-org>.turso.io" \
  TURSO_AUTH_TOKEN="<token-from-step-0.2>" \
  R2_ACCOUNT_ID="<from-step-0.3>" \
  R2_ACCESS_KEY_ID="<from-step-0.3>" \
  R2_SECRET_ACCESS_KEY="<from-step-0.3>" \
  R2_BUCKET="cpr-uploads" \
  ALLOWED_ORIGINS="cascadia-pigeon-rescue.fly.dev"
```

---

## 3. Deploy (me, ~3 min)

```bash
fly deploy
```

I'll watch the build and tell you what happens. If anything fails, we
fix it together before retrying.

---

## 4. Smoke test (~2 min)

```bash
fly status              # confirm machine is running + healthy
fly logs                # tail logs for errors
open https://cascadia-pigeon-rescue.fly.dev
```

Then walk the [smoke checklist in DEPLOY.md](./DEPLOY.md#smoke-checklist-after-first-prod-deploy).

---

## 5. Optional but recommended

### Custom domain

```bash
fly certs create cpr-ops.example.com
```

Add the CNAME shown by Fly to your DNS. After it propagates, update
`ALLOWED_ORIGINS`:

```bash
fly secrets set ALLOWED_ORIGINS="cpr-ops.example.com,cascadia-pigeon-rescue.fly.dev"
```

### Backups

Turso enables point-in-time restore on the dashboard — flip it on for
the `cpr-prod` database.

R2 supports [object versioning](https://developers.cloudflare.com/r2/buckets/object-versioning/)
on the bucket settings page — turn it on if you want soft-delete on
upload mistakes.

### Rotating the admin password

```bash
fly secrets set ADMIN_PASSWORD="<new-password>" AUTH_SECRET="$(openssl rand -hex 32)"
```

Bumping `AUTH_SECRET` invalidates every existing session immediately.
Skip it if you just want everyone to keep using their current sessions
until they expire.

---

## Common issues + fixes

**Build fails with "prisma client not generated"** — the Dockerfile runs
`npx prisma generate` before `npm run build`. If your schema is out of
sync, re-run `npx prisma db push` locally then commit any changes.

**Health check fails** — usually means `AUTH_SECRET` or
`ADMIN_PASSWORD` is missing. Check `fly logs` for the env validator's
error message; it tells you which var is missing.

**"machine failed to start"** — almost always migrations. Check
`fly logs` for the SQL error and reconcile with your local schema.

**R2 upload returns 500** — check the API token has Object Read+Write
on the right bucket. Easiest fix: regenerate the token and re-set the
secrets.
