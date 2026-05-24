# Volunteer Portal — Spec for Review

> **Status:** DRAFT for Christina + Rafa to iterate on.
> **Last updated:** 2026-05-19
> **Goal:** Give Cascadia Pigeon Rescue volunteers a lightweight, mobile-first login where they can see what's relevant to them and take action — without exposing the full admin ops dashboard.

---

## 1. Who uses this?

| Role | What they need | What they DON'T need |
|---|---|---|
| **Foster** | See their birds, log daily updates, request supplies, view meds schedule, update their availability | Edit OTHER fosters' birds, admin intake, medical records, rescue cases |
| **Transport driver** | See assigned/available transport requests, update their availability, mark pickups complete | Bird medical details, foster management, rescue ops |
| **Rescue volunteer** | See rescue cases in their area, claim/update rescue shifts, mark cases resolved | Foster management, medication admin, transport scheduling |
| **Christina (admin)** | Everything. She stays on the existing admin app. | — |

**Key insight:** A single volunteer might wear multiple hats (foster AND driver AND rescue). The portal should handle this naturally — show sections based on what roles they have, not force them into one.

---

## 2. Auth model

### Today
- One shared admin password for the whole team (Christina + Rafa).
- Single `ADMIN_PASSWORD` env var, `next-auth` Credentials provider.
- No user accounts in the DB. No concept of "who am I."

### Proposed for the volunteer portal

**Option A — Magic link (recommended):**
- Each volunteer has an `email` on their Foster / TransportVolunteer / RescueVolunteer record (most already do).
- Login flow: enter email → receive a magic link → click → logged in for 30 days.
- No password to remember, no password to rotate, no password shared in group chats.
- Implementation: `next-auth` EmailProvider with a lightweight transactional email service (Resend.com free tier = 100 emails/day = plenty).
- We can add the email provider alongside the existing Credentials provider so Christina keeps her admin password login untouched.

**Option B — Invite codes:**
- Christina generates a one-time invite code per volunteer from the admin UI.
- Volunteer enters code + picks a display name → gets a session.
- Simpler (no email infra), but codes can leak in group chats, and there's no way to reset access per-person without rotating everyone.

**Option C — Same shared password, different URL:**
- Simplest but no per-volunteer identity. Can't show "your birds" because we don't know who you are.
- Basically defeats the purpose.

**Recommendation:** Option A (magic link). It's the right tool for a small rescue with 5–20 volunteers. Low maintenance, secure enough, gives per-person identity so we can show "your birds" and "your shifts."

### Role resolution (how do we know what a volunteer can see?)

The DB already links people:
- `Foster.email` → foster role
- `TransportVolunteer.email` → transport driver role
- `RescueVolunteer.email` → rescue volunteer role
- `Foster.linkedFosterId` → cross-link (one person, multiple roles)

On login, look up the email across all three tables. Show UI sections for whichever roles match. If no match → "you don't have a volunteer profile yet, contact Christina."

---

## 3. What the volunteer sees

### 3a. Home / Dashboard

A mobile-first feed (like the existing admin dashboard, but filtered to YOU):

- **🐦 Your birds** (fosters only) — cards for each bird assigned to your foster record. Name, photo, status, medical priority, next med due. Tap → bird detail (read-only version, minus admin fields).
- **🚗 Your transport requests** (drivers only) — assigned pickups, upcoming, with route + timing. Tap → detail with map link.
- **🚨 Rescue alerts** (rescue volunteers only) — open `needs_rescue` cases. Location, description, first photo. "Claim this" button.
- **📅 Your upcoming shifts** — transport or rescue shifts you're signed up for this week.
- **📋 Quick actions** — "Log daily update" (fosters), "Mark pickup complete" (drivers), "Update my availability" (anyone).

### 3b. My Birds (foster role)

- List of birds assigned to this foster (filtered by `bird.fosterId` matching the Foster record linked to the logged-in email).
- Each bird card: photo, name, species, status, whereabouts badge (the one we just shipped in PR G), medical priority, starred badge.
- Tap → **Bird detail (volunteer view):**
  - Read-only summary: name, status, whereabouts, intake date, backstory, diet notes, behavior notes, special handling.
  - **Daily update form:** text note + optional photo upload. These go into the existing `DailyUpdate` model.
  - **Weight log:** can add a weight reading (same as admin).
  - **Medication schedule:** read-only view of active meds + doses. "Mark administered" button for each due dose.
  - **Photo gallery:** can add photos (same R2 upload flow as admin).
  - **Cannot edit:** status, medical notes, primary diagnosis, quarantine flags, foster assignment, whereabouts log. Those are admin-only.

### 3c. My Transport (driver role)

- Assigned requests (status = `open` or `in_progress`, assigned to this driver).
- Available requests (unassigned, within their `maxDistanceMi` if set).
- "Claim" button on available requests.
- For assigned: "Mark picked up" → "Mark delivered" → "Mark complete" flow.
- Availability calendar: same week-view as admin, but filtered to this volunteer. Can add/edit their own availability blocks. **Cannot** see other drivers' availability.

### 3d. Rescue (rescue volunteer role)

- Open `needs_rescue` cases (the emergency feed).
- Tap a case → detail with photos, location (tappable map link), description, assigned rescuer.
- "Claim this rescue" button if unassigned.
- "Update status" on claimed cases (rescued / escaped / closed_unable).
- Their rescue shifts for this week.
- Availability: same pattern as transport.

### 3e. My Profile

- View/edit: name, phone, email, address (on their Foster/Volunteer record).
- View/edit: transport details (vehicle type, max distance) if they're a driver.
- View/edit: rescue skills if they're a rescue volunteer.
- **Cannot** edit other people's profiles.

---

## 4. What the volunteer CANNOT see or do

| Blocked action | Why |
|---|---|
| Edit other fosters' birds | Privacy + ops safety |
| Change bird status, medical records, diagnosis | Clinical decisions are Christina's |
| Manage foster profiles (add/remove fosters) | Admin ops |
| See full volunteer directory (all names + contacts) | Privacy — they see their own profile only |
| Create new bird intake | Admin workflow |
| Modify whereabouts log | Admin tracks placements |
| Delete anything | Soft-delete is admin-only |
| Archive/restore | Admin-only |
| See the admin dashboard | Separate route + role check |
| Access `/api/*` mutation endpoints without auth | Middleware enforces role |

---

## 5. Technical architecture

### Same app, different routes

The cleanest approach: the volunteer portal lives **inside the same Next.js app** under a `/volunteer` route group. Same DB, same Prisma client, same API layer, same deploy. No separate service to maintain.

```
src/app/
  (admin)/           ← existing admin pages (birds/, fosters/, transport/, etc.)
  volunteer/         ← NEW volunteer portal
    layout.tsx       ← volunteer nav (simpler), role-based section visibility
    page.tsx         ← volunteer dashboard/feed
    birds/           ← "my birds" (foster role)
      [id]/          ← bird detail (volunteer view)
    transport/       ← "my transport" (driver role)
    rescue/          ← "my rescue" (rescue volunteer role)
    profile/         ← my profile
    shifts/          ← my upcoming shifts
  login/             ← shared login page (admin password OR magic link)
```

### Middleware update

```
/volunteer/*   → requires session + role ∈ {foster, driver, rescue}
/volunteer/birds/* → requires foster role
/volunteer/transport/* → requires driver role
/volunteer/rescue/* → requires rescue role
/(admin)/*     → requires session + role === 'admin'
```

### Data access pattern

Every volunteer query is **scoped by identity**:
```ts
// Foster viewing their birds:
prisma.bird.findMany({
  where: { fosterId: currentFoster.id, deletedAt: null, archivedAt: null }
})

// Driver viewing their assigned requests:
prisma.transportRequest.findMany({
  where: { assignedDriverId: currentDriver.id, status: { in: ['open', 'in_progress'] } }
})
```

No volunteer query ever returns data for other volunteers. This is enforced at the query level (not just the UI), so even a curious volunteer with DevTools can't see other people's data.

---

## 6. Migration plan

### Phase 1 — Auth + scaffold (1 day)
- Add `next-auth` EmailProvider (Resend.com).
- Add `role` to JWT token: `admin` (existing password login) or `volunteer` (magic link login).
- Middleware: route `/volunteer/*` to require volunteer session.
- Volunteer login page: "Enter your email" → magic link.
- Scaffold `/volunteer` layout with role-based nav.

### Phase 2 — Foster view (1 day)
- `/volunteer/birds` — my birds list (scoped to foster).
- `/volunteer/birds/[id]` — bird detail (read-only + daily update + weight + photo).
- "Mark med administered" action.

### Phase 3 — Transport + Rescue (1 day)
- `/volunteer/transport` — my requests + claim flow.
- `/volunteer/rescue` — open cases + claim + status update.
- `/volunteer/shifts` — my upcoming shifts.
- `/volunteer/profile` — self-edit.

### Phase 4 — Admin invite flow (half day)
- Christina can generate a magic-link invite from the admin UI (pre-fills the email, sends the first login link).
- "Revoke volunteer access" button (deletes sessions for that email).

### Total estimate: ~3.5 days of dev work.

---

## 7. Open questions for Christina

1. **Do all volunteers get the same portal, or do some get more access?** e.g. should a "lead foster" be able to see all birds, not just theirs?

2. **Notifications:** Should volunteers get email/text when:
   - A new rescue case is posted near them?
   - A transport request is assigned to them?
   - A med is coming due for their foster bird?
   If yes, that's Phase 5 (push notifications via email or SMS).

3. **Photo privacy:** Currently all bird photos are accessible by URL if you know the path (Cloudflare R2, no auth on the CDN). For the volunteer portal this is fine (they're all rescue volunteers, not the public). But if the portal ever becomes public-facing, we'd need signed URLs. Worth thinking about now?

4. **Volunteer self-signup:** Should volunteers be able to create their own profile (name, email, skills) and request to join? Or does Christina always create them manually first? Manual is simpler and safer for a small rescue.

5. **Overlap with Foster Hub feature request:** Christina previously mentioned wanting fosters to "check in" on their birds. Is the volunteer portal the right home for that, or does she want a separate lighter-weight thing (like a daily-update-only link)?

---

## 8. What we're NOT building (scope guard)

- **Public-facing website.** The portal is for authenticated volunteers only.
- **Chat / messaging.** Volunteers communicate via existing channels (Signal, text, etc.).
- **Scheduling AI.** No auto-assignment of transports or rescues. Christina dispatches manually; the portal just shows volunteers what's assigned to them.
- **Financial / donation tracking.** Out of scope.
- **Mobile native app.** The portal is mobile-optimized web (PWA-ready if we want an install button later, but native is not on the table).

---

*Review this with Christina. Mark up what's wrong, what's missing, what's overbuilt. I'll revise and then build it phase by phase.*
